import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    optimizeDeps: {
      include: [
        "@tanstack/react-router",
        "@tanstack/react-start",
        "@tanstack/history",
        "@tanstack/router-core",
        "@tanstack/react-cross-context",
      ],
    },
  },
});
