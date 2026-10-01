import { existsSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const outputs = [
  "dist",
  "artifacts",
  "test-results",
  "playwright-report",
  "coverage",
  "tsconfig.tsbuildinfo",
  ".ruff_cache",
  "backend/.ruff_cache",
  "backend/.pytest_cache",
  "src-tauri/gen",
  "src-tauri/tauri.release.generated.json",
];

// Only walk Python source trees; leave environments and dependency caches alone.
function removePythonCaches(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.name === "__pycache__") {
      rmSync(path, { recursive: true });
      console.log(`Removed ${path.slice(root.length)}`);
    } else {
      removePythonCaches(path);
    }
  }
}

for (const output of outputs) {
  const path = join(root, output);
  if (!existsSync(path)) continue;
  rmSync(path, { recursive: true, force: true });
  console.log(`Removed ${output}`);
}

removePythonCaches(join(root, "backend"));
