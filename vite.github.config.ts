import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "github",
  base: "/CR3-TIX-LEARN-LINUX-/",
  publicDir: "../public",
  plugins: [react()],
  build: { outDir: "../gh-pages-dist", emptyOutDir: true, sourcemap: true },
});
