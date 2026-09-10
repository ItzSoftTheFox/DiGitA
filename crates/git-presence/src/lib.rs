use serde::Serialize;
use std::{path::Path, process::{Command, Output}};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySnapshot {
    pub root: String,
    pub name: String,
    pub branch: String,
    pub detached: bool,
    pub commit: Option<Commit>,
    pub files: Vec<ChangedFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub authored_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub original_path: Option<String>,
    pub index_status: String,
    pub worktree_status: String,
    pub conflicted: bool,
}

fn git(path: &Path, args: &[&str]) -> Result<Output, String> {
    let mut command = Command::new("git");
    // An inherited GIT_DIR or GIT_WORK_TREE must not redirect the selected directory.
    for (key, _) in std::env::vars_os() {
        if key.to_string_lossy().starts_with("GIT_") {
            command.env_remove(key);
        }
    }
    command.current_dir(path)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("LC_ALL", "C")
        .args(["--no-optional-locks", "-c", "core.fsmonitor=false"])
        .args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.output().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "Git není dostupný. Nainstalujte Git a restartujte DiGitA.".to_string()
        } else {
            format!("Git nelze spustit: {error}")
        }
    })
}

fn checked(path: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let result = git(path, args)?;
    if !result.status.success() {
        return Err(format!("Git: {}", String::from_utf8_lossy(&result.stderr).trim()));
    }
    Ok(result.stdout)
}

#[derive(Default)]
struct Status {
    branch: String,
    oid: String,
    files: Vec<ChangedFile>,
}

fn parse_status(bytes: &[u8]) -> Result<Status, String> {
    let mut status = Status::default();
    let mut records = bytes.split(|b| *b == 0).filter(|r| !r.is_empty());
    while let Some(record) = records.next() {
        let line = String::from_utf8_lossy(record);
        if let Some(branch) = line.strip_prefix("# branch.head ") {
            status.branch = branch.to_string();
        } else if let Some(oid) = line.strip_prefix("# branch.oid ") {
            status.oid = oid.to_string();
        } else if let Some(path) = line.strip_prefix("? ") {
            status.files.push(ChangedFile {
                path: path.to_string(), original_path: None,
                index_status: "?".into(), worktree_status: "?".into(), conflicted: false,
            });
        } else if matches!(record[0], b'1' | b'2' | b'u') {
            let columns = match record[0] { b'1' => 9, b'2' => 10, _ => 11 };
            let parts: Vec<_> = line.splitn(columns, ' ').collect();
            if parts.len() != columns || parts[1].len() != 2 {
                return Err("Git vrátil neplatný stav souborů.".into());
            }
            let original_path = if record[0] == b'2' {
                Some(String::from_utf8_lossy(records.next().ok_or("Chybí původní název souboru.")?).into_owned())
            } else { None };
            status.files.push(ChangedFile {
                path: parts[columns - 1].to_string(), original_path,
                index_status: parts[1][0..1].to_string(),
                worktree_status: parts[1][1..2].to_string(),
                conflicted: record[0] == b'u',
            });
        }
    }
    if status.branch.is_empty() || status.oid.is_empty() {
        return Err("Git nevrátil informace o větvi.".into());
    }
    status.files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(status)
}

pub fn read_repository(path: &str) -> Result<RepositorySnapshot, String> {
    let selected = Path::new(path);
    if !selected.is_dir() {
        return Err("Vybraná složka neexistuje nebo není přístupná.".into());
    }
    let root_bytes = checked(selected, &["rev-parse", "--show-toplevel"])?;
    let root_text = String::from_utf8(root_bytes)
        .map_err(|_| "Cesta repozitáře musí být platné UTF-8.".to_string())?;
    let root = root_text.strip_suffix('\n').unwrap_or(&root_text);
    // A carriage return may be part of a valid directory name on Unix.
    #[cfg(windows)]
    let root = root.strip_suffix('\r').unwrap_or(root);
    let root = root.to_string();
    let root_path = Path::new(&root);
    let status = parse_status(&checked(root_path, &[
        "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all", "--ignore-submodules=none",
    ])?)?;
    let commit = if status.oid == "(initial)" {
        None
    } else {
        // Read the captured OID so a checkout between the commands cannot mix commits.
        let bytes = checked(root_path, &["log", "-1", "--no-show-signature", "--format=%H%x00%s%x00%an%x00%aI", &status.oid, "--"])?;
        let text = String::from_utf8_lossy(&bytes);
        let parts: Vec<_> = text.trim_end_matches(['\r', '\n']).splitn(4, '\0').collect();
        if parts.len() != 4 { return Err("Git vrátil neplatná metadata commitu.".into()); }
        Some(Commit {
            hash: parts[0].into(), subject: parts[1].into(), author: parts[2].into(), authored_at: parts[3].into(),
        })
    };
    let detached = status.branch == "(detached)";
    Ok(RepositorySnapshot {
        name: root_path.file_name().unwrap_or_default().to_string_lossy().into_owned(),
        root,
        branch: if detached { "Detached HEAD".into() } else { status.branch },
        detached, commit, files: status.files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::{tempdir, TempDir};

    fn repo() -> TempDir {
        let dir = tempdir().unwrap();
        checked(dir.path(), &["init", "-b", "main"]).unwrap();
        checked(dir.path(), &["config", "user.email", "test@example.invalid"]).unwrap();
        checked(dir.path(), &["config", "user.name", "Test"]).unwrap();
        dir
    }
    fn read(dir: &TempDir) -> RepositorySnapshot {
        read_repository(dir.path().to_str().unwrap()).unwrap()
    }
    fn commit(dir: &TempDir) {
        checked(dir.path(), &["add", "."]).unwrap();
        checked(dir.path(), &["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "-m", "První commit"]).unwrap();
    }

    #[test]
    fn empty_repo_and_untracked_unicode() {
        let dir = repo();
        let snapshot = read(&dir);
        assert_eq!(snapshot.branch, "main");
        assert!(snapshot.commit.is_none());
        fs::write(dir.path().join("český soubor.txt"), "hello").unwrap();
        assert_eq!(read(&dir).files[0].path, "český soubor.txt");
        assert_eq!(read(&dir).files[0].index_status, "?");
    }

    #[test]
    fn detects_edit_stage_rename_delete_and_ignored_files() {
        let dir = repo();
        fs::write(dir.path().join("one.txt"), "one").unwrap();
        fs::write(dir.path().join(".gitignore"), "ignored.txt\n").unwrap();
        commit(&dir);
        assert!(read(&dir).files.is_empty());
        assert_eq!(read(&dir).commit.unwrap().subject, "První commit");
        fs::write(dir.path().join("ignored.txt"), "secret").unwrap();
        fs::write(dir.path().join("one.txt"), "two").unwrap();
        assert_eq!(read(&dir).files[0].worktree_status, "M");
        checked(dir.path(), &["add", "one.txt"]).unwrap();
        assert_eq!(read(&dir).files[0].index_status, "M");
        commit(&dir);
        checked(dir.path(), &["mv", "one.txt", "two words.txt"]).unwrap();
        let files = read(&dir).files;
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "two words.txt");
        assert_eq!(files[0].original_path.as_deref(), Some("one.txt"));
        commit(&dir);
        fs::remove_file(dir.path().join("two words.txt")).unwrap();
        assert_eq!(read(&dir).files[0].worktree_status, "D");
    }

    #[test]
    fn detached_head_and_subdirectory() {
        let dir = repo();
        fs::write(dir.path().join("file"), "one").unwrap();
        commit(&dir);
        checked(dir.path(), &["checkout", "--detach"]).unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();
        let snapshot = read_repository(dir.path().join("sub").to_str().unwrap()).unwrap();
        assert!(snapshot.detached);
        assert_eq!(snapshot.root, read(&dir).root);
    }

    #[test]
    fn rejects_non_repository_and_missing_directory() {
        let dir = tempdir().unwrap();
        assert!(read_repository(dir.path().to_str().unwrap()).is_err());
        assert!(read_repository(dir.path().join("missing").to_str().unwrap()).is_err());
    }

    #[test]
    fn linked_worktree() {
        let dir = repo();
        fs::write(dir.path().join("file"), "one").unwrap();
        commit(&dir);
        let parent = tempdir().unwrap();
        let worktree = parent.path().join("linked");
        checked(dir.path(), &["worktree", "add", "-b", "feature/test", worktree.to_str().unwrap()]).unwrap();
        fs::write(worktree.join("file"), "two").unwrap();
        let snapshot = read_repository(worktree.to_str().unwrap()).unwrap();
        assert_eq!(snapshot.branch, "feature/test");
        assert_eq!(snapshot.files[0].worktree_status, "M");
    }

    #[test]
    fn conflict_and_newlines_in_paths() {
        let status = parse_status(b"# branch.oid (initial)\0# branch.head main\0u UU N... 100644 100644 100644 100644 a b c conflicted file\0? line\nbreak.txt\0").unwrap();
        assert!(status.files[0].conflicted);
        assert_eq!(status.files[1].path, "line\nbreak.txt");
    }
}
