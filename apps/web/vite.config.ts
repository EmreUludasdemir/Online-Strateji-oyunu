import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.FRONTIER_API_PROXY_TARGET || "http://localhost:3101";
  const wsProxyTarget = env.FRONTIER_WS_PROXY_TARGET || apiProxyTarget.replace(/^http/, "ws");
  const devPort = Number(env.FRONTIER_WEB_PORT || 5173);
  const releaseVersion = env.FRONTIER_RELEASE_VERSION || process.env.npm_package_version || "0.0.1";
  const isProduction = mode === "production";

  return {
    define: {
      __APP_VERSION__: JSON.stringify(releaseVersion),
    },
    plugins: [react()],
    build: {
      target: "es2020",
      sourcemap: isProduction ? "hidden" : true,
      minify: isProduction ? "terser" : false,
      terserOptions: isProduction
        ? {
            compress: {
              drop_console: true,
              drop_debugger: true,
            },
          }
        : undefined,
      rollupOptions: {
        output: {
          manualChunks: {
            phaser: ["phaser"],
            react: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
          },
        },
      },
      reportCompressedSize: true,
      chunkSizeWarningLimit: 500,
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
    preview: {
      port: Number.isFinite(devPort) ? devPort : 5173,
    },
  };
});
