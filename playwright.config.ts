import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:1421", ...devices["Desktop Chrome"] },
  webServer: [
    {
      command: "VITE_API_URL=http://127.0.0.1:8001 npm run dev -- --port 1421",
      url: "http://127.0.0.1:1421",
      reuseExistingServer: false,
    },
    {
      command: "cd backend && .venv/bin/python -m tests.serve_e2e",
      url: "http://127.0.0.1:8001/health",
      reuseExistingServer: false,
    },
  ],
});
