import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseConfig } from "./prepare-release.mjs";

test("release CSP permits only the selected API and WebSocket origin", () => {
  const config = releaseConfig("https://api.example.com", "0.1.0", "v0.1.0");
  assert.equal(config.bundle.active, true);
  assert.match(
    config.app.security.csp,
    /https:\/\/api\.example\.com wss:\/\/api\.example\.com;/,
  );
  assert.ok(!config.app.security.csp.includes("127.0.0.1"));
});
test("rejects insecure URLs, credential injection and mismatched tags", () => {
  for (const url of [
    "http://example.com",
    "https://localhost",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com?x=1",
    "https://example.com/#x",
  ]) {
    assert.throws(() => releaseConfig(url, "0.1.0", "v0.1.0"));
  }
  assert.throws(() => releaseConfig("https://example.com", "0.1.0", "v9.0.0"));
});

for (const [platform, targets] of Object.entries({
  win32: ["nsis"],
  darwin: ["dmg"],
  linux: ["deb", "appimage"],
})) {
  test(`selects native bundles for ${platform}`, () => {
    assert.deepEqual(
      releaseConfig("https://api.example.com", "0.1.0", "v0.1.0", platform)
        .bundle.targets,
      targets,
    );
  });
}
test("rejects unsupported installer platforms", () => {
  assert.throws(() =>
    releaseConfig("https://api.example.com", "0.1.0", "v0.1.0", "android"),
  );
});
