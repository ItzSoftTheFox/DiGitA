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
        .invoke_handler(tauri::generate_handler![read_repository])
        .run(tauri::generate_context!())
        .expect("DiGitA se nepodařilo spustit");
}
