#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
async fn read_repository(path: String) -> Result<git_presence::RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || git_presence::read_repository(&path))
        .await
        .map_err(|error| format!("Čtení repozitáře selhalo: {error}"))?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![read_repository, load_session, save_session, clear_session])
        .run(tauri::generate_context!())
        .expect("DiGitA se nepodařilo spustit");
}

fn session_entry(server: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("app.digita.desktop", server).map_err(|_| "Systémové úložiště přihlášení není dostupné.".into())
}

#[tauri::command]
async fn load_session(server: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        match session_entry(&server)?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("Systémové úložiště přihlášení není dostupné.".into()),
        }
    }).await.map_err(|_| "Načtení přihlášení selhalo.".to_string())?
}

#[tauri::command]
async fn save_session(server: String, token: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        session_entry(&server)?.set_password(&token).map_err(|_| "Přihlášení nelze uložit do systémového úložiště.".into())
    }).await.map_err(|_| "Uložení přihlášení selhalo.".to_string())?
}

#[tauri::command]
async fn clear_session(server: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        match session_entry(&server)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Uložené přihlášení nelze odstranit.".into()),
        }
    }).await.map_err(|_| "Odstranění přihlášení selhalo.".to_string())?
}
