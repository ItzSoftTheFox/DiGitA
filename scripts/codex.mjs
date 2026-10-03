import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const rolePath = (name) =>
  fileURLToPath(new URL(`../tooling/codex/${name}.toml`, import.meta.url));

const args = [
  "--cd",
  root,
  "--strict-config",
  "--config",
  "agents.enabled=true",
  "--config",
  "features.multi_agent=true",
  "--config",
  "agents.max_concurrent_threads_per_session=2",
];

for (const [name, description] of [
  ["frontend", "DiGitA React/TypeScript UI, website, translations and frontend tests."],
  ["backend", "DiGitA Python API, database, WebSocket rooms and native Rust/Git integration."],
]) {
  args.push(
    "--config",
    `agents.${name}.description=${JSON.stringify(description)}`,
    "--config",
    `agents.${name}.config_file=${JSON.stringify(rolePath(name))}`,
  );
}

// Pass arguments directly; prompts and paths never go through a shell.
const result = spawnSync("codex", [...args, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Cannot start Codex: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
