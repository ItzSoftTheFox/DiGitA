# Working with the Codex team

The primary session is the Coordinator. Frontend and Backend are workers created
for bounded tasks; they are not three permanently running services. You give the
Coordinator a feature or bug and receive one integrated result. Small tasks may
need no worker, and dependent steps may run sequentially.

## Start from the terminal

From the repository root, with Node.js and Codex CLI installed and signed in:

```sh
npm run codex
```

This launches the interactive Codex Coordinator. The launcher registers the two
worker roles and caps open worker threads at two. The root `AGENTS.md` supplies
Coordinator instructions. It inherits your existing model, authentication,
permissions, MCP servers and installed skills; role files do not select a model.

Pass a task directly or select a model using normal Codex arguments:

```sh
npm run codex -- "Implement remembered local projects. Coordinate Frontend and Backend and verify the complete flow."
npm run codex -- --model YOUR_AVAILABLE_MODEL
```

To return to a session, use the resume picker:

```sh
npm run codex -- resume
```

Choose the Coordinator session. `resume --last` may select a more recent worker
session, so the picker is preferable. Use `/agent` in an interactive session to
inspect or switch to workers; send normal feature requests to the Coordinator.

Start normally with `codex` from this repository if you prefer: `AGENTS.md` still
defines the workflow. The launcher additionally registers named Frontend/Backend
role configurations and enables multi-agent tools for that invocation. With a
plain launch, the Coordinator can supply those instructions to available workers.

The wrapper is for interactive sessions and `resume`. Run operational commands
such as `codex features list`, `codex doctor` or `codex debug` directly; these
subcommands do not all accept the launcher's `--strict-config` option.

The launcher uses documented `agents.<name>.config_file` declarations pointing to
tracked files in `tooling/codex/`. It does not write into the protected `.codex/`
directory or alter global configuration. Verified locally with Codex CLI 0.159.3;
`--strict-config` makes unsupported configuration fail visibly on other versions.

## Desktop app or IDE

Open DiGitA as the project and start a new chat in the repository root. Give it a
task such as:

```text
Work as the DiGitA Coordinator according to AGENTS.md. Delegate suitable work to
Frontend and Backend, agree interfaces, and verify the integrated result.
Task: [describe the behavior you want]
```

The terminal launcher is not automatically applied to app/IDE chats. Project
instructions still describe the roles and fallback delegation. Tool availability
depends on the client. When delegation tools are absent, the Coordinator must say
so and handle the task sequentially. Never assume separate chats share messages
or memory without an actual communication tool.

## Ownership and communication

| Role | Primary files |
| --- | --- |
| Frontend | `src/`, `website/`, `public/`, frontend tests |
| Backend | `backend/`, `src-tauri/`, `crates/`, Python and Rust tests |
| Coordinator | Root configuration, `e2e/`, `docs/`, `scripts/`, releases and integration |

These roles coordinate work; they are not sandbox isolation. The Coordinator
assigns explicit files per task, retains ownership of shared configuration, and
reserves generated website outputs before a Frontend build writes into `docs/`.

Use real agent messages for assignments, blockers and contract decisions. Route
cross-role questions through the Coordinator so it can keep both workers aligned.
Only the Coordinator updates [the current work record](current-work.md). For
small completed tasks, the final response is enough; avoid a growing transcript.
For substantial work, keep this record concise and replace stale status when the
next task begins. Documentation persists across sessions; worker context does not
replace it. Worktree copies of the record require deliberate synchronization.

Every assignment should include:

```text
Goal and acceptance checks:
Role, working directory and editable files:
Agreed HTTP/WebSocket/native contract, if affected:
Dependencies and files reserved by other agents:
Required verification:
Return changed files, behavior, checks/results, blockers and integration needs.
```

For a profile feature, first agree editable fields, authorization, response shape
and validation errors. Backend implements storage/API; Frontend implements the
editor against that agreement. Coordinator integrates and checks the full flow.

## Shared checkout versus worktrees

The normal `npm run codex` workflow uses built-in subagents. Assume they share the
checkout until their actual working directories establish otherwise. Exclusive
file ownership is enough for independent changes. Coordinate broad formatters,
lockfiles, cleanup, website builds and test-server ports explicitly.

For long-lived independent Codex sessions, use separate worktrees. A worktree is
a separate checkout, not an automatic communication channel. Before branching,
the Coordinator needs a committed baseline or an explicit transfer of required
uncommitted changes. Creating, committing and merging branches requires the
user's authorization under this project's rules.

When that baseline and authorization exist, an example setup is:

```sh
git worktree add -b work/frontend ../DiGitA-frontend HEAD
git worktree add -b work/backend ../DiGitA-backend HEAD
```

Assign each worker the correct directory, feature, commit base and reserved files.
Install needed dependencies there and configure separate ports when necessary.
Ignored files such as `.env`, private notes and installed dependencies are not
automatically transferred. The Coordinator reviews/integrates worker commits and
performs checks against the combined result. Keep the simple subagent workflow
unless isolation materially helps; the launcher does not create worktrees.

## Official references

- [OpenAI: subagents and custom roles](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [OpenAI: agent configuration keys](https://learn.chatgpt.com/docs/config-file/config-reference)
- [OpenAI: project instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [OpenAI: Git worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
