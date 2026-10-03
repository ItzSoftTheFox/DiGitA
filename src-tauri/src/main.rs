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
        .invoke_handler(tauri::generate_handler![read_repository, load_session, save_session, clear_session, load_preferences, save_preferences, clear_preferences])
        .run(tauri::generate_context!())
        .expect("DiGitA could not start");
}

fn session_entry(server: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("app.digita.desktop", server).map_err(|_| "The system credential store is unavailable.".into())
}

#[tauri::command]
async fn load_session(server: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        match session_entry(&server)?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("The system credential store is unavailable.".into()),
        }
    }).await.map_err(|_| "Could not load the saved session.".to_string())?
}

#[tauri::command]
async fn save_session(server: String, token: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        session_entry(&server)?.set_password(&token).map_err(|_| "Could not save the session in the system credential store.".into())
    }).await.map_err(|_| "Could not save the session.".to_string())?
}

#[tauri::command]
async fn clear_session(server: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        match session_entry(&server)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Could not remove the saved session.".into()),
        }
    }).await.map_err(|_| "Could not remove the session.".to_string())?
}
