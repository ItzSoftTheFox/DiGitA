# Local Git snapshots

`read_repository` only reads the selected working copy. It never fetches, writes
Git state, or publishes repository data. Optional Git locks and fsmonitor are
disabled, inherited `GIT_*` overrides are removed, and stdin is closed.

Each command has a five-second deadline and an eight-MiB combined stdout/stderr
budget. The whole snapshot has a fifteen-second deadline shared by its commands.
Exceeding a limit, malformed status, or invalid UTF-8 returns an error rather than
a partial snapshot. Successful snapshots always set `statusComplete: true`.
The caller must treat an error as unavailable/stale status, never as a clean tree.

On Unix, each command uses its own process group. On a limit or pipe error the
group is killed and the direct child is waited for. Windows terminates and waits
for the direct child; process-tree termination is not implemented there. Reader
threads never block the caller past a command deadline if a helper retains pipes.
Process-limit tests run on Unix; other operating systems need native validation.

`upstream`, `ahead`, and `behind` come from local porcelain-v2 status. They may be
stale until the user fetches separately. Counts are null when tracking objects are
unavailable or the branch has no commits. A detached HEAD has no upstream. The
latest commit is read using the exact OID captured in status; an unborn branch
has a null commit. `operation` detects rebase, merge, or cherry-pick markers in
the actual Git directory, including linked worktrees. Snapshot fields are local
only and do not extend the collaboration presence contract.

Run `cargo test --locked --manifest-path crates/git-presence/Cargo.toml` from the
project root. Tests cover local tracking divergence, missing upstream objects,
unborn/detached states, real conflicts/operations, linked-worktree markers, 3,000
untracked files, malformed output, and timeout/output-limit termination and reap.
