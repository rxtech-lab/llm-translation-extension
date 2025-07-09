import { defineConfig } from "vitest/config";
import { resolve } from "path";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@src": resolve(__dirname, "src"),
      "@assets": resolve(__dirname, "src/assets"),
      "@locales": resolve(__dirname, "src/locales"),
      "@pages": resolve(__dirname, "src/pages"),
    },
  },
});
