import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.FRONTIER_API_PROXY_TARGET || "http://localhost:3101";
  const wsProxyTarget = env.FRONTIER_WS_PROXY_TARGET || apiProxyTarget.replace(/^http/, "ws");
  const devPort = Number(env.FRONTIER_WEB_PORT || 5173);

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            phaser: ["phaser"],
            react: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
          },
        },
      },
    },
    server: {
      port: Number.isFinite(devPort) ? devPort : 5173,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        "/ws": {
          target: wsProxyTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
