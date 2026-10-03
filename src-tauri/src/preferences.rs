//! Local-only preferences. Credentials and consent never belong here.
use serde::{Deserialize, Deserializer, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;

const MAX_FILE_BYTES: u64 = 1024 * 1024;
const MAX_RECENT_PROJECTS: usize = 20;
const MAX_ROOM_PROJECTS: usize = 100;
static PREFERENCES_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalPreferences {
    version: u8,
    recent_projects: Vec<RecentProject>,
    // Custom deserialization makes this nullable field required in the JSON object.
    #[serde(deserialize_with = "required_nullable_path")]
    active_project_path: Option<String>,
    room_projects: Vec<RoomProject>,
    notifications_enabled: bool,
}

fn required_nullable_path<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(deserializer)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecentProject {
    path: String,
    name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RoomProject {
    server: String,
    account_id: String,
    room_id: String,
    path: String,
}

fn valid_text(value: &str, max_bytes: usize) -> bool {
    !value.trim().is_empty() && value.len() <= max_bytes && !value.chars().any(char::is_control)
}

impl LocalPreferences {
    fn validate(&self) -> Result<(), String> {
        if self.version != 2 {
            return Err("Unsupported local preferences version.".into());
        }
        if self.recent_projects.len() > MAX_RECENT_PROJECTS
            || self.room_projects.len() > MAX_ROOM_PROJECTS
        {
            return Err("Too many saved projects or room associations.".into());
        }
        let mut paths = HashSet::new();
        for project in &self.recent_projects {
            if !valid_text(&project.path, 4096) || !valid_text(&project.name, 255) {
                return Err("A saved project has an invalid path or name.".into());
            }
            if !paths.insert(project.path.as_str()) {
                return Err("Recent projects contain duplicate paths.".into());
            }
        }
        if self
            .active_project_path
            .as_deref()
            .is_some_and(|path| !paths.contains(path))
        {
            return Err("The active project must be in recent projects.".into());
        }
        let mut associations = HashSet::new();
        for project in &self.room_projects {
            if !valid_text(&project.server, 2048)
                || !valid_text(&project.account_id, 128)
                || !valid_text(&project.room_id, 128)
                || !paths.contains(project.path.as_str())
            {
                return Err("A room association has invalid fields or an unknown project.".into());
            }
            let server = tauri::Url::parse(&project.server)
                .map_err(|_| "A room association has an invalid server address.".to_string())?;
            let loopback = matches!(server.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
            if !(server.scheme() == "https" || server.scheme() == "http" && loopback)
                || server.host_str().is_none()
                || !server.username().is_empty()
                || server.password().is_some()
                || server.query().is_some()
                || server.fragment().is_some()
                || server.as_str().trim_end_matches('/') != project.server
            {
                return Err("A room association has an invalid server address.".into());
            }
            if !associations.insert((
                project.server.as_str(),
                project.account_id.as_str(),
                project.room_id.as_str(),
            )) {
                return Err(
                    "Room associations contain duplicate backend/account/room entries.".into(),
                );
            }
        }
        Ok(())
    }
}

fn load_from(path: &Path) -> Result<Option<LocalPreferences>, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Could not read local preferences.".into()),
    };
    // Bound the actual read, including if another process grows the file after opening it.
    let mut bytes = Vec::new();
    file.take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Could not read local preferences.".to_string())?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("Local preferences are too large. Clear them in Settings to reset.".into());
    }
    let damaged = || "Local preferences are damaged. Clear them in Settings to reset.".to_string();
    let mut value: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| damaged())?;
    if value.get("version").and_then(serde_json::Value::as_u64) == Some(1) {
        // Accept only the bounded legacy volume field; all other fields remain strict.
        let volume = value.get("volume").and_then(serde_json::Value::as_u64);
        if !volume.is_some_and(|volume| volume <= 100) {
            return Err(damaged());
        }
        let object = value.as_object_mut().ok_or_else(damaged)?;
        object.remove("volume");
        object.insert("version".into(), serde_json::json!(2));
    }
    let preferences: LocalPreferences = serde_json::from_value(value).map_err(|_| damaged())?;
    preferences.validate()?;
    Ok(Some(preferences))
}

fn save_to(path: &Path, preferences: &LocalPreferences) -> Result<(), String> {
    preferences.validate()?;
    let bytes = serde_json::to_vec_pretty(preferences)
        .map_err(|_| "Could not encode local preferences.".to_string())?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("Local preferences are too large to save.".into());
    }
    let directory = path
        .parent()
        .ok_or_else(|| "Could not locate local preferences.".to_string())?;
    fs::create_dir_all(directory)
        .map_err(|_| "Could not create the local preferences folder.".to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(directory)
        .map_err(|_| "Could not write local preferences.".to_string())?;
    temporary
        .write_all(&bytes)
        .and_then(|()| temporary.as_file().sync_all())
        .map_err(|_| "Could not write local preferences.".to_string())?;
    // Same-directory replacement preserves the previous complete file on write failure.
    // tempfile handles replacing an existing destination on Windows as well as Unix.
    temporary
        .persist(path)
        .map_err(|_| "Could not replace local preferences.".to_string())?;
    Ok(())
}

fn clear_at(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Could not clear local preferences.".into()),
    }
}

fn preferences_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("local-preferences.json"))
        .map_err(|_| "Could not locate local preferences.".into())
}

#[tauri::command]
pub async fn load_preferences(app: tauri::AppHandle) -> Result<Option<LocalPreferences>, String> {
    let path = preferences_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = PREFERENCES_LOCK
            .lock()
            .map_err(|_| "Local preferences are unavailable.".to_string())?;
        load_from(&path)
    })
    .await
    .map_err(|_| "Could not load local preferences.".to_string())?
}

#[tauri::command]
pub async fn save_preferences(
    app: tauri::AppHandle,
    preferences: LocalPreferences,
) -> Result<(), String> {
    let path = preferences_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = PREFERENCES_LOCK
            .lock()
            .map_err(|_| "Local preferences are unavailable.".to_string())?;
        save_to(&path, &preferences)
    })
    .await
    .map_err(|_| "Could not save local preferences.".to_string())?
}

#[tauri::command]
pub async fn clear_preferences(app: tauri::AppHandle) -> Result<(), String> {
    let path = preferences_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = PREFERENCES_LOCK
            .lock()
            .map_err(|_| "Local preferences are unavailable.".to_string())?;
        clear_at(&path)
    })
    .await
    .map_err(|_| "Could not clear local preferences.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn preferences() -> LocalPreferences {
        LocalPreferences {
            version: 2,
            recent_projects: vec![RecentProject {
                path: "/missing/local/repository".into(),
                name: "Repository".into(),
            }],
            active_project_path: Some("/missing/local/repository".into()),
            room_projects: vec![RoomProject {
                server: "https://example.test/api".into(),
                account_id: "account-1".into(),
                room_id: "room-1".into(),
                path: "/missing/local/repository".into(),
            }],
            notifications_enabled: false,
        }
    }

    #[test]
    fn round_trip_and_atomic_replacement_allow_missing_folders() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("nested/preferences.json");
        assert_eq!(load_from(&path).unwrap(), None);
        let mut saved = preferences();
        save_to(&path, &saved).unwrap();
        assert_eq!(load_from(&path).unwrap(), Some(saved.clone()));
        saved.notifications_enabled = true;
        save_to(&path, &saved).unwrap();
        assert_eq!(load_from(&path).unwrap(), Some(saved));
        assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
    }

    #[test]
    fn legacy_volume_is_validated_and_removed_without_losing_projects_or_notifications() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("preferences.json");
        let mut saved = preferences();
        saved.notifications_enabled = true;
        let mut legacy = serde_json::to_value(&saved).unwrap();
        legacy["version"] = serde_json::json!(1);
        legacy["volume"] = serde_json::json!(25);
        fs::write(&path, serde_json::to_vec(&legacy).unwrap()).unwrap();
        let migrated = load_from(&path).unwrap().unwrap();
        assert_eq!(migrated, saved);
        save_to(&path, &migrated).unwrap();
        let written: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(written["version"], 2);
        assert!(written.get("volume").is_none());
        for invalid_volume in [
            serde_json::json!(-1),
            serde_json::json!(101),
            serde_json::json!(12.5),
            serde_json::json!(true),
            serde_json::json!(null),
        ] {
            legacy["volume"] = invalid_volume;
            fs::write(&path, serde_json::to_vec(&legacy).unwrap()).unwrap();
            assert!(load_from(&path).is_err());
        }
        legacy.as_object_mut().unwrap().remove("volume");
        fs::write(&path, serde_json::to_vec(&legacy).unwrap()).unwrap();
        assert!(load_from(&path).is_err());
        legacy["volume"] = serde_json::json!(25);
        legacy["sharingEnabled"] = serde_json::json!(true);
        fs::write(&path, serde_json::to_vec(&legacy).unwrap()).unwrap();
        assert!(load_from(&path).is_err());
        let mut current = serde_json::to_value(saved).unwrap();
        current["volume"] = serde_json::json!(25);
        assert!(serde_json::from_value::<LocalPreferences>(current).is_err());
    }

    #[test]
    fn corrupt_and_future_preferences_are_preserved_until_clear() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("preferences.json");
        fs::write(&path, b"{broken").unwrap();
        assert!(load_from(&path).unwrap_err().contains("damaged"));
        assert_eq!(fs::read(&path).unwrap(), b"{broken");
        let mut future = serde_json::to_value(preferences()).unwrap();
        future["version"] = serde_json::json!(3);
        fs::write(&path, serde_json::to_vec(&future).unwrap()).unwrap();
        assert!(load_from(&path).unwrap_err().contains("version"));
        clear_at(&path).unwrap();
        clear_at(&path).unwrap();
        assert_eq!(load_from(&path).unwrap(), None);
    }

    #[test]
    fn required_fields_and_privacy_sensitive_unknown_fields_are_rejected() {
        let value = serde_json::to_value(preferences()).unwrap();
        for field in [
            "version",
            "recentProjects",
            "activeProjectPath",
            "roomProjects",
            "notificationsEnabled",
        ] {
            let mut invalid = value.clone();
            invalid.as_object_mut().unwrap().remove(field);
            assert!(
                serde_json::from_value::<LocalPreferences>(invalid).is_err(),
                "{field}"
            );
        }
        for field in [
            "token",
            "sharingEnabled",
            "listening",
            "notificationPermission",
        ] {
            let mut invalid = value.clone();
            invalid[field] = serde_json::json!(true);
            assert!(serde_json::from_value::<LocalPreferences>(invalid).is_err());
        }
        let mut nested = value;
        nested["roomProjects"][0]["token"] = serde_json::json!("secret");
        assert!(serde_json::from_value::<LocalPreferences>(nested).is_err());
    }

    #[test]
    fn invalid_save_preserves_previous_preferences_and_validates_references() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("preferences.json");
        let saved = preferences();
        save_to(&path, &saved).unwrap();
        let mut invalid = saved.clone();
        invalid.version = 3;
        assert!(save_to(&path, &invalid).is_err());
        assert_eq!(load_from(&path).unwrap(), Some(saved.clone()));
        invalid = saved.clone();
        invalid.active_project_path = Some("/other".into());
        assert!(invalid.validate().is_err());
        invalid = saved;
        invalid.room_projects[0].path = "/other".into();
        assert!(invalid.validate().is_err());
    }

    #[test]
    fn bounds_and_duplicates_are_rejected() {
        let mut invalid = preferences();
        invalid.recent_projects = (0..MAX_RECENT_PROJECTS + 1)
            .map(|index| RecentProject {
                path: format!("/project/{index}"),
                name: "Project".into(),
            })
            .collect();
        assert!(invalid.validate().is_err());
        invalid = preferences();
        invalid.room_projects = (0..MAX_ROOM_PROJECTS + 1)
            .map(|index| RoomProject {
                room_id: format!("room-{index}"),
                ..invalid.room_projects[0].clone()
            })
            .collect();
        assert!(invalid.validate().is_err());
        invalid = preferences();
        invalid
            .recent_projects
            .push(invalid.recent_projects[0].clone());
        assert!(invalid.validate().is_err());
        invalid = preferences();
        invalid.room_projects.push(invalid.room_projects[0].clone());
        assert!(invalid.validate().is_err());
        for text in ["".to_string(), "a".repeat(256), "name\n".into()] {
            invalid = preferences();
            invalid.recent_projects[0].name = text;
            assert!(invalid.validate().is_err());
        }
        invalid = preferences();
        invalid.recent_projects[0].path = "a".repeat(4097);
        assert!(invalid.validate().is_err());
        invalid = preferences();
        invalid.room_projects[0].account_id = "a".repeat(129);
        assert!(invalid.validate().is_err());
    }

    #[test]
    fn server_credentials_and_unsafe_addresses_are_rejected() {
        for server in [
            "https://user:secret@example.test",
            "https://example.test?token=secret",
            "https://example.test#secret",
            "http://example.test",
            "file:///tmp/repo",
            "invalid",
        ] {
            let mut invalid = preferences();
            invalid.room_projects[0].server = server.into();
            assert!(invalid.validate().is_err(), "{server}");
        }
        for server in [
            "http://localhost:8000",
            "http://127.0.0.1:8000",
            "http://[::1]:8000",
        ] {
            let mut valid = preferences();
            valid.room_projects[0].server = server.into();
            valid.validate().unwrap();
        }
    }

    #[test]
    fn noncanonical_servers_are_rejected_before_persistence() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("preferences.json");
        let saved = preferences();
        save_to(&path, &saved).unwrap();
        for server in [
            "https://EXAMPLE.test",
            "HTTPS://example.test",
            "https://example.test/",
            "https://example.test/api/",
            "https://example.test:443",
            "http://localhost:80",
            "https://example.test/old/../api",
        ] {
            let mut invalid = saved.clone();
            invalid.room_projects[0].server = server.into();
            assert!(save_to(&path, &invalid).is_err(), "{server}");
        }
        assert_eq!(load_from(&path).unwrap(), Some(saved));
    }

    #[test]
    fn oversized_and_structurally_invalid_files_are_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("preferences.json");
        fs::write(&path, vec![b' '; MAX_FILE_BYTES as usize + 1]).unwrap();
        assert!(load_from(&path).unwrap_err().contains("too large"));
        let mut value = serde_json::to_value(preferences()).unwrap();
        value["notificationsEnabled"] = serde_json::json!(12.5);
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
        assert!(load_from(&path).is_err());
    }

    #[test]
    fn oversized_serialized_save_does_not_replace_existing_preferences() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("preferences.json");
        let saved = preferences();
        save_to(&path, &saved).unwrap();
        let mut oversized = preferences();
        oversized.recent_projects = (0..MAX_RECENT_PROJECTS)
            .map(|index| RecentProject {
                path: format!("/{index:02}{}", "\"".repeat(4093)),
                name: "Project".into(),
            })
            .collect();
        oversized.active_project_path = None;
        oversized.room_projects = (0..MAX_ROOM_PROJECTS)
            .map(|index| RoomProject {
                server: format!("https://example.test/{}", "x".repeat(2000)),
                account_id: "account".into(),
                room_id: format!("room-{index}"),
                path: oversized.recent_projects[0].path.clone(),
            })
            .collect();
        oversized.validate().unwrap();
        assert!(save_to(&path, &oversized)
            .unwrap_err()
            .contains("too large"));
        assert_eq!(load_from(&path).unwrap(), Some(saved));
    }

    #[test]
    fn filesystem_write_replace_and_clear_errors_are_reported() {
        let directory = tempfile::tempdir().unwrap();
        let blocker = directory.path().join("blocker");
        fs::write(&blocker, b"existing").unwrap();
        assert!(save_to(&blocker.join("preferences.json"), &preferences()).is_err());
        assert_eq!(fs::read(&blocker).unwrap(), b"existing");
        let destination = directory.path().join("destination");
        fs::create_dir(&destination).unwrap();
        assert!(save_to(&destination, &preferences())
            .unwrap_err()
            .contains("replace"));
        assert!(clear_at(&destination).is_err());
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 2);
    }
}
