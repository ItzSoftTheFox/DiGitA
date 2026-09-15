import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Tauri watches Rust sources; Vite must avoid locked Windows build artifacts.
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: {
    environment: "jsdom",
    clearMocks: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
