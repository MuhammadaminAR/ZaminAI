import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  // Load local server-only variables for development without exposing them to the browser.
  const localEnv = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(localEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    plugins: [
      tailwindcss(),
      tanstackStart({
        server: { entry: "./server.ts" },
      }),
      nitro(),
      viteReact(),
      tsconfigPaths(),
    ],
  };
});
