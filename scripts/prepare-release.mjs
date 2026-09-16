import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function releaseConfig(
  apiUrl,
  version,
  tag,
  platform = process.platform,
) {
  const url = new URL(apiUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !/^[a-z0-9.-]+$/.test(url.hostname) ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error(
      "Release requires a public HTTPS API origin without credentials or path.",
    );
  }
  if (tag !== `v${version}`)
    throw new Error(`Release tag must be v${version}.`);
  const targets = {
    win32: ["nsis"],
    darwin: ["dmg"],
    linux: ["deb", "appimage"],
  }[platform];
  if (!targets) throw new Error(`Unsupported release platform: ${platform}`);
  return {
    bundle: {
      active: true,
      targets,
      ...(platform === "darwin" ? { macOS: { signingIdentity: "-" } } : {}),
    },
    app: {
      security: {
        csp: `default-src 'self'; connect-src 'self' ipc: http://ipc.localhost ${url.origin} ${url.origin.replace(/^https:/, "wss:")}; img-src 'self' asset: http://asset.localhost data:; style-src 'self' 'unsafe-inline'; media-src 'self'; object-src 'none'; base-uri 'self'`,
      },
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const cargo = readFileSync("src-tauri/Cargo.toml", "utf8").match(
    /^version = "([^"]+)"/m,
  )?.[1];
  if (app.version !== pkg.version || app.version !== cargo)
    throw new Error("Desktop versions differ.");
  const config = releaseConfig(
    process.env.VITE_API_URL,
    app.version,
    process.env.RELEASE_TAG,
  );
  writeFileSync(
    "src-tauri/tauri.release.generated.json",
    JSON.stringify(config, null, 2) + "\n",
  );
}
