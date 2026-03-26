import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: resolve(__dirname),
  base: "/",
  server: {
    port: 12000,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:12001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "../dist/web"),
    emptyOutDir: true,
  },
});
