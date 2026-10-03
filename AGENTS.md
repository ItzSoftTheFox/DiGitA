# DiGitA agent workflow

## Roles and delegation

The primary Codex session is the **Coordinator**. A delegated agent follows its
assigned Frontend or Backend role instead of assuming the Coordinator role.
The user authorizes the Coordinator to delegate useful independent work to these
two agents without asking again on each task. Keep small or dependent changes in
the primary session. Spawn only agents needed by the current task, with at most
two workers active. Workers do not spawn further agents.

Use configured `frontend` and `backend` roles when the client exposes them.
Otherwise use the available worker/delegation tools and provide the relevant
instructions from `tooling/codex/frontend.toml` or `tooling/codex/backend.toml`.
If delegation tools are unavailable, say so and continue sequentially under the
same ownership rules; do not claim another agent worked on a task.

| Role | Default ownership |
| --- | --- |
| Frontend | `src/`, `website/`, frontend tests, `public/` |
| Backend | `backend/`, `src-tauri/`, `crates/`, backend and Rust tests |
| Coordinator | `e2e/`, `docs/`, root configuration, `scripts/`, `packaging/`, `.github/`, integration and review |

These are coordination rules, not filesystem access restrictions. All agents may
read relevant files. Reassign a file explicitly before another agent edits it.
The Frontend agent owns `src/lib/api.ts`; the Backend agent owns API schemas and
native commands. The Coordinator reconciles changes across that boundary.
Website builds write to `docs/`; give the Frontend agent an explicit reservation
for generated website files before it runs that build.

## Coordinator procedure

1. Inspect `git status`, the request and relevant source. Start with
   `docs/codebase.md`; read `docs/coordination.md` when assigning concurrent work.
   Read `docs/current-work.md` when resuming substantial unfinished work.
2. Define the expected user behavior, acceptance checks and any API/WebSocket or
   native-command contract affected. Confirm the contract between workers before
   they implement dependent pieces; do not invent endpoints independently.
3. Assign each worker a bounded task, explicit editable paths, relevant context,
   checks and expected handoff. Reserve shared files with a single editor. In a
   shared checkout, do not edit reserved files while the worker is active.
4. Relay cross-role decisions and blocking findings using actual agent messages.
   Wait for dependent results, integrate changes, and review the combined diff.
5. Run checks appropriate to the final change. Report what changed, evidence and
   remaining limitations. For substantial unfinished work, update
   `docs/current-work.md` with decisions, ownership and the next step.

Only the Coordinator updates shared work records or performs Git integration.
Do not stage, commit, switch branches, merge, publish or deploy unless the user
has authorized that operation. Preserve existing uncommitted work.

## Shared checkout and worktrees

Built-in subagents may share the primary checkout. They are not automatically
isolated in worktrees. Use exclusive file ownership for their edits. Do not run
`npm run clean`, full-tree formatters, shared lockfile updates, or competing test
servers while other agents use the affected files, outputs or ports.

For separately launched long-lived sessions, prefer an explicitly assigned Git
worktree/branch per worker. Tell each worker its actual working directory. A new
worktree starts from committed history; transfer required uncommitted changes
deliberately. Do not let a worker assume the primary checkout is its worktree.

## Project conventions and checks

- Keep project Markdown, source UI strings and website copy in English. Maintain
  Czech UI translations in `src/i18n/translations.cs.json`. Respond to the user in
  their language.
- Frontend: run relevant Vitest tests and `npm run build` for changed TypeScript
  or UI behavior. Use existing Playwright scenarios for affected user flows.
- Backend: from `backend/`, use `uv run pytest` for relevant tests and the existing
  Ruff checks. Do not treat SQLite tests as proof of PostgreSQL-specific behavior.
- Rust: use `cargo test --locked --manifest-path crates/git-presence/Cargo.toml`
  for Git changes and `cargo check --locked --manifest-path src-tauri/Cargo.toml`
  for native changes.
- Run one backend worker: live room state is in memory. Preserve explicit Git
  metadata sharing consent and keep repository contents local.
- `docs/index.html`, `docs/assets/`, `docs/images/` and `docs/downloads/` are
  published website files. Preserve them; edit website sources in `website/`.
- Private notes/tools live in ignored `docs/local/` and `scripts/local/`. Keep
  credentials, `.env` files and account data out of tracked handoff documents.
- Use installed skills only when their scope fits; project conventions take
  precedence. Do not infer an ADHD diagnosis or enable `$i-have-adhd` implicitly.

## Local context resources

On machines where they exist, user-requested resources are catalogued in
`/home/Fox/agent-resources/README.md`, with pinned revisions in `sources.json`.
Consult only relevant sections for retrieval, workflows or additional skills;
do not load entire reference repositories. Claude-specific hooks and commands
are not automatically supported in Codex.

For substantial exploration, use the configured `codebase-memory` MCP when
useful: index this project, execute structural queries, then verify important
findings against source. Never index the whole home directory by default. If MCP
is unavailable, use ordinary file search or its documented CLI. Do not claim
graph results without executing a query. Persist useful decisions and unfinished
work in project documentation; indexing does not preserve conversation memory.
