use serde::Serialize;
use std::{
    io::{self, Read},
    path::Path,
    process::{Child, Command, Output, Stdio},
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc, Arc,
    },
    thread,
    time::{Duration, Instant},
};

// Each command shares one budget across stdout/stderr. A repository snapshot also
// has an overall deadline; limits return errors and never partial snapshots.
const COMMAND_TIMEOUT: Duration = Duration::from_secs(5);
const SNAPSHOT_TIMEOUT: Duration = Duration::from_secs(15);
const OUTPUT_LIMIT: usize = 8 * 1024 * 1024;

#[derive(Clone, Copy)]
struct Limits {
    deadline: Instant,
    output: usize,
}

#[cfg(test)]
impl Limits {
    fn command() -> Self {
        Self {
            deadline: Instant::now() + COMMAND_TIMEOUT,
            output: OUTPUT_LIMIT,
        }
    }
}

enum PipeResult {
    Complete(bool, Vec<u8>),
    Limit,
    Error(io::Error),
}

fn read_pipe(
    mut pipe: impl Read + Send + 'static,
    stdout: bool,
    sender: mpsc::Sender<PipeResult>,
    total: Arc<AtomicUsize>,
    limit: usize,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut buffer = [0; 8192];
        loop {
            match pipe.read(&mut buffer) {
                Ok(0) => {
                    let _ = sender.send(PipeResult::Complete(stdout, bytes));
                    return;
                }
                Ok(count) => {
                    if total
                        .fetch_add(count, Ordering::Relaxed)
                        .saturating_add(count)
                        > limit
                    {
                        let _ = sender.send(PipeResult::Limit);
                        return;
                    }
                    bytes.extend_from_slice(&buffer[..count]);
                }
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                Err(error) => {
                    let _ = sender.send(PipeResult::Error(error));
                    return;
                }
            }
        }
    })
}

fn terminate(child: &mut Child) {
    // Kill Git's process group as well as Git itself so helpers cannot retain
    // output pipes and keep the reader threads alive after the deadline.
    #[cfg(unix)]
    unsafe {
        extern "C" {
            fn kill(pid: i32, signal: i32) -> i32;
        }
        kill(-(child.id() as i32), 9);
    }
    let _ = child.kill();
    let _ = child.wait(); // Always reap the direct child, including output failures.
}

fn bounded_output(command: &mut Command, limits: Limits) -> Result<Output, String> {
    if Instant::now() >= limits.deadline {
        return Err("Git timed out; repository status is unavailable.".into());
    }
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command.spawn().map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            "Git is unavailable. Install Git and restart DiGitA.".to_string()
        } else {
            format!("Could not start Git: {error}")
        }
    })?;
    let (sender, receiver) = mpsc::channel();
    let total = Arc::new(AtomicUsize::new(0));
    let stdout_reader = read_pipe(
        child.stdout.take().unwrap(),
        true,
        sender.clone(),
        total.clone(),
        limits.output,
    );
    let stderr_reader = read_pipe(
        child.stderr.take().unwrap(),
        false,
        sender,
        total,
        limits.output,
    );
    let mut stdout: Option<Vec<u8>> = None;
    let mut stderr: Option<Vec<u8>> = None;
    let mut status = None;
    let result = loop {
        if Instant::now() >= limits.deadline {
            break Err("Git timed out; repository status is unavailable.".to_string());
        }
        if status.is_none() {
            match child.try_wait() {
                Ok(value) => status = value,
                Err(error) => break Err(format!("Could not wait for Git: {error}")),
            }
        }
        if let (Some(status), Some(stdout), Some(stderr)) =
            (status, stdout.as_ref(), stderr.as_ref())
        {
            break Ok(Output {
                status,
                stdout: stdout.clone(),
                stderr: stderr.clone(),
            });
        }
        let wait = limits
            .deadline
            .saturating_duration_since(Instant::now())
            .min(Duration::from_millis(10));
        match receiver.recv_timeout(wait) {
            Ok(PipeResult::Complete(true, bytes)) => stdout = Some(bytes),
            Ok(PipeResult::Complete(false, bytes)) => stderr = Some(bytes),
            Ok(PipeResult::Limit) => {
                break Err(
                    "Git output exceeded the 8 MiB limit; repository status is unavailable.".into(),
                )
            }
            Ok(PipeResult::Error(error)) => {
                break Err(format!("Could not read Git output: {error}"))
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                // Both pipes finished; still enforce the deadline while waiting for Git.
                thread::sleep(wait);
            }
        }
    };
    if result.is_err() {
        terminate(&mut child);
    }
    // Completed pipes can be joined without waiting. On platforms without group
    // termination a rogue descendant may retain a pipe; never wait past our limit.
    if stdout_reader.is_finished() {
        let _ = stdout_reader.join();
    }
    if stderr_reader.is_finished() {
        let _ = stderr_reader.join();
    }
    result
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySnapshot {
    pub root: String,
    pub name: String,
    pub branch: String,
    pub detached: bool,
    pub upstream: Option<String>,
    pub ahead: Option<u64>,
    pub behind: Option<u64>,
    pub operation: Option<Operation>,
    pub status_complete: bool,
    pub commit: Option<Commit>,
    pub files: Vec<ChangedFile>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Operation {
    Merge,
    Rebase,
    CherryPick,
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

#[cfg(test)]
fn git(path: &Path, args: &[&str]) -> Result<Output, String> {
    git_with_limits(path, args, Limits::command())
}

fn git_with_limits(path: &Path, args: &[&str], limits: Limits) -> Result<Output, String> {
    let mut command = Command::new("git");
    // An inherited GIT_DIR or GIT_WORK_TREE must not redirect the selected directory.
    for (key, _) in std::env::vars_os() {
        if key.to_string_lossy().starts_with("GIT_") {
            command.env_remove(key);
        }
    }
    command
        .current_dir(path)
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
    bounded_output(&mut command, limits)
}

#[cfg(test)]
fn checked(path: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let result = git(path, args)?;
    if !result.status.success() {
        return Err(format!(
            "Git: {}",
            String::from_utf8_lossy(&result.stderr).trim()
        ));
    }
    Ok(result.stdout)
}

fn checked_with_limits(path: &Path, args: &[&str], deadline: Instant) -> Result<Vec<u8>, String> {
    let result = git_with_limits(
        path,
        args,
        Limits {
            deadline: deadline.min(Instant::now() + COMMAND_TIMEOUT),
            output: OUTPUT_LIMIT,
        },
    )?;
    if !result.status.success() {
        return Err(format!(
            "Git: {}",
            String::from_utf8_lossy(&result.stderr).trim()
        ));
    }
    Ok(result.stdout)
}

#[derive(Default)]
struct Status {
    branch: String,
    oid: String,
    upstream: Option<String>,
    ahead: Option<u64>,
    behind: Option<u64>,
    files: Vec<ChangedFile>,
}

fn parse_status(bytes: &[u8]) -> Result<Status, String> {
    if !bytes.ends_with(&[0]) {
        return Err("Git returned an incomplete status.".into());
    }
    let mut status = Status::default();
    let mut records = bytes[..bytes.len() - 1].split(|b| *b == 0);
    while let Some(record) = records.next() {
        if record.is_empty() {
            return Err("Git returned an empty status record.".into());
        }
        let line = std::str::from_utf8(record).map_err(|_| "Git status contains invalid UTF-8.")?;
        if let Some(branch) = line.strip_prefix("# branch.head ") {
            if !status.branch.is_empty() {
                return Err("Git returned duplicate branch information.".into());
            }
            status.branch = branch.to_string();
        } else if let Some(oid) = line.strip_prefix("# branch.oid ") {
            if !status.oid.is_empty() {
                return Err("Git returned duplicate commit information.".into());
            }
            status.oid = oid.to_string();
        } else if let Some(upstream) = line.strip_prefix("# branch.upstream ") {
            if upstream.is_empty() || status.upstream.is_some() {
                return Err("Git returned an invalid upstream.".into());
            }
            status.upstream = Some(upstream.to_string());
        } else if let Some(counts) = line.strip_prefix("# branch.ab ") {
            if status.ahead.is_some() {
                return Err("Git returned duplicate upstream counts.".into());
            }
            let (ahead, behind) = counts
                .split_once(' ')
                .ok_or("Git returned invalid upstream counts.")?;
            status.ahead = Some(
                ahead
                    .strip_prefix('+')
                    .and_then(|n| n.parse().ok())
                    .ok_or("Git returned invalid ahead count.")?,
            );
            status.behind = Some(
                behind
                    .strip_prefix('-')
                    .and_then(|n| n.parse().ok())
                    .ok_or("Git returned invalid behind count.")?,
            );
        } else if let Some(path) = line.strip_prefix("? ") {
            if path.is_empty() {
                return Err("Git returned an empty file name.".into());
            }
            status.files.push(ChangedFile {
                path: path.to_string(),
                original_path: None,
                index_status: "?".into(),
                worktree_status: "?".into(),
                conflicted: false,
            });
        } else if matches!(record[0], b'1' | b'2' | b'u') {
            let columns = match record[0] {
                b'1' => 9,
                b'2' => 10,
                _ => 11,
            };
            let parts: Vec<_> = line.splitn(columns, ' ').collect();
            if parts.len() != columns
                || parts[1].len() != 2
                || !parts[1].bytes().all(|b| b".MADRCUT".contains(&b))
                || parts[columns - 1].is_empty()
            {
                return Err("Git returned an invalid file status.".into());
            }
            let original_path = if record[0] == b'2' {
                let original = std::str::from_utf8(
                    records.next().ok_or("The original file name is missing.")?,
                )
                .map_err(|_| "Git status contains invalid UTF-8.")?;
                if original.is_empty() {
                    return Err("The original file name is missing.".into());
                }
                Some(original.to_string())
            } else {
                None
            };
            status.files.push(ChangedFile {
                path: parts[columns - 1].to_string(),
                original_path,
                index_status: parts[1][0..1].to_string(),
                worktree_status: parts[1][1..2].to_string(),
                conflicted: record[0] == b'u',
            });
        } else {
            return Err("Git returned an unknown status record.".into());
        }
    }
    if status.branch.is_empty() || status.oid.is_empty() {
        return Err("Git did not return branch information.".into());
    }
    if status.oid != "(initial)" && !valid_oid(&status.oid) {
        return Err("Git returned an invalid commit hash.".into());
    }
    if status.upstream.is_none() || status.oid == "(initial)" {
        status.ahead = None;
        status.behind = None;
    }
    status.files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(status)
}

fn valid_oid(oid: &str) -> bool {
    matches!(oid.len(), 40 | 64) && oid.bytes().all(|b| b.is_ascii_hexdigit())
}

pub fn read_repository(path: &str) -> Result<RepositorySnapshot, String> {
    let deadline = Instant::now() + SNAPSHOT_TIMEOUT;
    let selected = Path::new(path);
    if !selected.is_dir() {
        return Err("The selected folder does not exist or is inaccessible.".into());
    }
    let root_bytes = checked_with_limits(selected, &["rev-parse", "--show-toplevel"], deadline)?;
    let root_text = String::from_utf8(root_bytes)
        .map_err(|_| "The repository path must be valid UTF-8.".to_string())?;
    let root = root_text.strip_suffix('\n').unwrap_or(&root_text);
    // A carriage return may be part of a valid directory name on Unix.
    #[cfg(windows)]
    let root = root.strip_suffix('\r').unwrap_or(root);
    let root = root.to_string();
    let root_path = Path::new(&root);
    let status = parse_status(&checked_with_limits(
        root_path,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            "--untracked-files=all",
            "--ignore-submodules=none",
        ],
        deadline,
    )?)?;
    let commit = if status.oid == "(initial)" {
        None
    } else {
        // Read the captured OID so a checkout between the commands cannot mix commits.
        let bytes = checked_with_limits(
            root_path,
            &[
                "log",
                "-1",
                "--no-show-signature",
                "--format=%H%x00%s%x00%an%x00%aI",
                &status.oid,
                "--",
            ],
            deadline,
        )?;
        let text = std::str::from_utf8(&bytes).map_err(|_| "Git commit contains invalid UTF-8.")?;
        let parts: Vec<_> = text
            .trim_end_matches(['\r', '\n'])
            .splitn(4, '\0')
            .collect();
        if parts.len() != 4 || !valid_oid(parts[0]) || parts[0] != status.oid {
            return Err("Git returned invalid commit metadata.".into());
        }
        Some(Commit {
            hash: parts[0].into(),
            subject: parts[1].into(),
            author: parts[2].into(),
            authored_at: parts[3].into(),
        })
    };
    let git_dir = checked_with_limits(root_path, &["rev-parse", "--absolute-git-dir"], deadline)?;
    let git_dir =
        std::str::from_utf8(&git_dir).map_err(|_| "The Git directory must be valid UTF-8.")?;
    let git_dir = git_dir.strip_suffix('\n').unwrap_or(git_dir);
    #[cfg(windows)]
    let git_dir = git_dir.strip_suffix('\r').unwrap_or(git_dir);
    let git_dir = Path::new(git_dir);
    let operation =
        if git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists() {
            Some(Operation::Rebase)
        } else if git_dir.join("MERGE_HEAD").exists() {
            Some(Operation::Merge)
        } else if git_dir.join("CHERRY_PICK_HEAD").exists() {
            Some(Operation::CherryPick)
        } else {
            None
        };
    if Instant::now() >= deadline {
        return Err("Git timed out; repository status is unavailable.".into());
    }
    let detached = status.branch == "(detached)";
    Ok(RepositorySnapshot {
        name: root_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        root,
        branch: if detached {
            "Detached HEAD".into()
        } else {
            status.branch
        },
        detached,
        commit,
        files: status.files,
        upstream: status.upstream,
        ahead: status.ahead,
        behind: status.behind,
        operation,
        status_complete: true,
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
        checked(
            dir.path(),
            &["config", "user.email", "test@example.invalid"],
        )
        .unwrap();
        checked(dir.path(), &["config", "user.name", "Test"]).unwrap();
        dir
    }
    fn read(dir: &TempDir) -> RepositorySnapshot {
        read_repository(dir.path().to_str().unwrap()).unwrap()
    }
    fn commit(dir: &TempDir) {
        checked(dir.path(), &["add", "."]).unwrap();
        checked(
            dir.path(),
            &[
                "-c",
                "commit.gpgsign=false",
                "-c",
                "core.hooksPath=/dev/null",
                "commit",
                "-m",
                "První commit",
            ],
        )
        .unwrap();
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
        checked(
            dir.path(),
            &[
                "worktree",
                "add",
                "-b",
                "feature/test",
                worktree.to_str().unwrap(),
            ],
        )
        .unwrap();
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
    #[test]
    fn local_upstream_divergence_missing_tracking_and_unborn() {
        let dir = repo();
        let initial = read(&dir);
        assert!(initial.status_complete);
        assert!(initial.upstream.is_none() && initial.ahead.is_none() && initial.behind.is_none());
        fs::write(dir.path().join("base"), "base").unwrap();
        commit(&dir);
        checked(dir.path(), &["branch", "tracking"]).unwrap();
        checked(dir.path(), &["branch", "--set-upstream-to=tracking"]).unwrap();
        assert_eq!((read(&dir).ahead, read(&dir).behind), (Some(0), Some(0)));
        fs::write(dir.path().join("local"), "local").unwrap();
        commit(&dir);
        checked(dir.path(), &["checkout", "tracking"]).unwrap();
        fs::write(dir.path().join("remote"), "remote").unwrap();
        commit(&dir);
        checked(dir.path(), &["checkout", "main"]).unwrap();
        let snapshot = read(&dir);
        assert_eq!(snapshot.upstream.as_deref(), Some("tracking"));
        assert_eq!((snapshot.ahead, snapshot.behind), (Some(1), Some(1)));
        checked(dir.path(), &["branch", "-D", "tracking"]).unwrap();
        assert!(read(&dir).ahead.is_none() && read(&dir).behind.is_none());
        checked(dir.path(), &["checkout", "--detach"]).unwrap();
        let detached = read(&dir);
        assert!(detached.detached && detached.commit.is_some());
        assert!(detached.upstream.is_none());
    }

    #[test]
    fn real_conflicted_merge_cherry_pick_and_rebase_are_read_only() {
        let dir = repo();
        fs::write(dir.path().join("file"), "base\n").unwrap();
        commit(&dir);
        checked(dir.path(), &["checkout", "-b", "side"]).unwrap();
        fs::write(dir.path().join("file"), "side\n").unwrap();
        commit(&dir);
        checked(dir.path(), &["checkout", "main"]).unwrap();
        fs::write(dir.path().join("file"), "main\n").unwrap();
        commit(&dir);
        for (args, expected, abort) in [
            (
                vec!["-c", "core.hooksPath=/dev/null", "merge", "side"],
                Operation::Merge,
                vec!["merge", "--abort"],
            ),
            (
                vec!["-c", "core.hooksPath=/dev/null", "cherry-pick", "side"],
                Operation::CherryPick,
                vec!["cherry-pick", "--abort"],
            ),
            (
                vec!["-c", "core.hooksPath=/dev/null", "rebase", "side"],
                Operation::Rebase,
                vec!["rebase", "--abort"],
            ),
        ] {
            assert!(!git(dir.path(), &args).unwrap().status.success());
            let index = fs::read(dir.path().join(".git/index")).unwrap();
            let content = fs::read(dir.path().join("file")).unwrap();
            let head = checked(dir.path(), &["rev-parse", "HEAD"]).unwrap();
            let snapshot = read(&dir);
            assert_eq!(snapshot.operation, Some(expected));
            assert!(snapshot.files.iter().any(|file| file.conflicted));
            assert_eq!(fs::read(dir.path().join(".git/index")).unwrap(), index);
            assert_eq!(fs::read(dir.path().join("file")).unwrap(), content);
            assert_eq!(checked(dir.path(), &["rev-parse", "HEAD"]).unwrap(), head);
            checked(dir.path(), &abort).unwrap();
            assert!(read(&dir).operation.is_none());
        }
    }

    #[test]
    fn operation_markers_use_the_worktree_git_directory() {
        let dir = repo();
        fs::write(dir.path().join("file"), "base").unwrap();
        commit(&dir);
        let parent = tempdir().unwrap();
        let worktree = parent.path().join("linked");
        checked(
            dir.path(),
            &["worktree", "add", "-b", "other", worktree.to_str().unwrap()],
        )
        .unwrap();
        let git_dir = checked(&worktree, &["rev-parse", "--absolute-git-dir"]).unwrap();
        let git_dir = Path::new(std::str::from_utf8(&git_dir).unwrap().trim_end());
        fs::write(git_dir.join("CHERRY_PICK_HEAD"), "marker").unwrap();
        assert_eq!(
            read_repository(worktree.to_str().unwrap())
                .unwrap()
                .operation,
            Some(Operation::CherryPick)
        );
        assert!(read(&dir).operation.is_none());
        fs::create_dir(git_dir.join("rebase-merge")).unwrap();
        assert_eq!(
            read_repository(worktree.to_str().unwrap())
                .unwrap()
                .operation,
            Some(Operation::Rebase)
        );
    }

    #[test]
    fn large_repository_returns_every_relative_path_without_index_writes() {
        let dir = repo();
        fs::write(dir.path().join("tracked"), "base").unwrap();
        commit(&dir);
        for number in 0..3000 {
            fs::write(dir.path().join(format!("untracked-{number:04}")), "x").unwrap();
        }
        let index = fs::read(dir.path().join(".git/index")).unwrap();
        let snapshot = read(&dir);
        assert!(snapshot.status_complete);
        assert_eq!(snapshot.files.len(), 3000);
        assert_eq!(snapshot.files.first().unwrap().path, "untracked-0000");
        assert_eq!(snapshot.files.last().unwrap().path, "untracked-2999");
        assert_eq!(fs::read(dir.path().join(".git/index")).unwrap(), index);
    }

    #[test]
    fn malformed_or_truncated_status_never_succeeds_or_panics() {
        for bytes in [
            b"# branch.oid (initial)\0# branch.head main\0? missing-terminator".as_slice(),
            b"# branch.oid (initial)\0# branch.head main\0x invalid\0",
            b"# branch.oid bogus\0# branch.head main\0",
            b"# branch.oid (initial)\0# branch.head main\0# branch.ab +a -0\0",
            b"# branch.oid (initial)\0# branch.head main\0? \xff\0",
            b"# branch.oid (initial)\0# branch.head main\0? \0",
            "# branch.oid (initial)\0# branch.head main\01 é N... 100644 100644 100644 a b file\0".as_bytes(),
            b"# branch.oid (initial)\0# branch.head main\02 R. N... 100644 100644 100644 a b R100 new\0",
        ] {
            assert!(parse_status(bytes).is_err());
        }
    }

    #[cfg(unix)]
    fn assert_process_gone(pid: &str) {
        assert!(!Command::new("kill")
            .args(["-0", pid.trim()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap()
            .success());
    }

    #[test]
    #[cfg(unix)]
    fn timeout_kills_and_reaps_even_when_pipes_are_closed() {
        let dir = tempdir().unwrap();
        let pid_path = dir.path().join("pid");
        let mut command = Command::new("sh");
        command
            .args([
                "-c",
                "echo $$ > \"$1\"; exec 1>&- 2>&-; exec sleep 30",
                "test",
            ])
            .arg(&pid_path);
        let start = Instant::now();
        let error = bounded_output(
            &mut command,
            Limits {
                deadline: start + Duration::from_millis(150),
                output: 1024,
            },
        )
        .unwrap_err();
        assert!(error.contains("timed out"));
        assert!(start.elapsed() < Duration::from_secs(2));
        assert_process_gone(&fs::read_to_string(pid_path).unwrap());
    }

    #[test]
    #[cfg(unix)]
    fn combined_output_limit_kills_and_reaps() {
        let dir = tempdir().unwrap();
        let pid_path = dir.path().join("pid");
        let mut command = Command::new("sh");
        command.args(["-c", "echo $$ > \"$1\"; while :; do printf '0123456789abcdef'; printf '0123456789abcdef' >&2; done", "test"]).arg(&pid_path);
        let start = Instant::now();
        let error = bounded_output(
            &mut command,
            Limits {
                deadline: start + Duration::from_secs(2),
                output: 1024,
            },
        )
        .unwrap_err();
        assert!(error.contains("output exceeded"));
        assert!(start.elapsed() < Duration::from_secs(2));
        assert_process_gone(&fs::read_to_string(pid_path).unwrap());
    }
}
