import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works at any URL, including
  // GitHub Pages' subpath (…github.io/warp/). Dev server is unaffected.
  base: "./",
});
