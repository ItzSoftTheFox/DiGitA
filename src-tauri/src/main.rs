#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod preferences;
use preferences::{clear_preferences, load_preferences, save_preferences};

#[tauri::command]
async fn read_repository(path: String) -> Result<git_presence::RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || git_presence::read_repository(&path))
        .await
        .map_err(|error| format!("Repository read failed: {error}"))?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            read_repository,
            open_project_link,
            load_session,
            save_session,
            clear_session,
            load_preferences,
            save_preferences,
            clear_preferences
        ])
        .run(tauri::generate_context!())
        .expect("DiGitA could not start");
}

fn session_entry(server: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("app.digita.desktop", server)
        .map_err(|_| "The system credential store is unavailable.".into())
}

#[tauri::command]
async fn load_session(server: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || match session_entry(&server)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("The system credential store is unavailable.".into()),
    })
    .await
    .map_err(|_| "Could not load the saved session.".to_string())?
}

#[tauri::command]
async fn save_session(server: String, token: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        session_entry(&server)?
            .set_password(&token)
            .map_err(|_| "Could not save the session in the system credential store.".into())
    })
    .await
    .map_err(|_| "Could not save the session.".to_string())?
}

#[tauri::command]
async fn clear_session(server: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        match session_entry(&server)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Could not remove the saved session.".into()),
        }
    })
    .await
    .map_err(|_| "Could not remove the session.".to_string())?
}

fn project_url(link: &str) -> Result<&'static str, String> {
    match link {
        "help" => Ok("https://github.com/ItzSoftTheFox/DiGitA#readme"),
        "issues" => Ok("https://github.com/ItzSoftTheFox/DiGitA/issues/new"),
        _ => Err("Unsupported project link.".into()),
    }
}

fn project_launcher(platform: &str) -> Result<&'static str, String> {
    match platform {
        "linux" => Ok("xdg-open"),
        "macos" => Ok("open"),
        "windows" => Ok("explorer.exe"),
        _ => Err("Opening project links is unavailable on this platform.".into()),
    }
}

#[tauri::command]
async fn open_project_link(link: String) -> Result<(), String> {
    // Validate before starting any task/process; frontend cannot supply arbitrary URLs.
    let url = project_url(&link)?;
    let launcher = project_launcher(std::env::consts::OS)?;
    tauri::async_runtime::spawn_blocking(move || {
        use std::process::{Command, Stdio};
        use std::time::{Duration, Instant};
        let mut command = Command::new(launcher);
        command
            .arg(url)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let mut child = command.spawn().map_err(|_| {
            "Could not open the project link. Check your default browser.".to_string()
        })?;
        let deadline = Instant::now() + Duration::from_millis(250);
        loop {
            match child.try_wait() {
                Ok(Some(status)) if status.success() => return Ok(()),
                Ok(Some(_)) => {
                    return Err(
                        "Could not open the project link. Check your default browser.".into(),
                    )
                }
                Err(_) => {
                    std::thread::spawn(move || {
                        let _ = child.wait();
                    });
                    return Err("Could not check the browser launcher.".into());
                }
                Ok(None) => {}
            }
            if Instant::now() >= deadline {
                // Some launchers stay alive while a newly opened browser runs. A dedicated
                // thread reaps the launcher without blocking Tauri or killing the browser.
                // Errors after this startup window cannot be reported to the frontend.
                std::thread::spawn(move || {
                    let _ = child.wait();
                });
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    })
    .await
    .map_err(|_| "Could not open the project link.".to_string())?
}

#[cfg(test)]
mod project_link_tests {
    use super::{project_launcher, project_url};

    #[test]
    fn project_links_allow_only_fixed_help_and_issue_destinations() {
        assert_eq!(
            project_url("help").unwrap(),
            "https://github.com/ItzSoftTheFox/DiGitA#readme"
        );
        assert_eq!(
            project_url("issues").unwrap(),
            "https://github.com/ItzSoftTheFox/DiGitA/issues/new"
        );
        for invalid in [
            "",
            "Help",
            "help ",
            "https://example.com",
            "file:///etc/passwd",
            "--help",
            "issues;echo secret",
        ] {
            assert!(project_url(invalid).is_err());
        }
    }

    #[test]
    fn project_launchers_are_fixed_for_supported_platforms() {
        assert_eq!(project_launcher("linux").unwrap(), "xdg-open");
        assert_eq!(project_launcher("macos").unwrap(), "open");
        assert_eq!(project_launcher("windows").unwrap(), "explorer.exe");
        assert!(project_launcher("unknown").is_err());
    }
}
