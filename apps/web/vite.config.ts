import path from "node:path";
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
    resolve: {
      alias: {
        phaser3spectorjs: path.resolve(__dirname, "src/lib/emptyModule.ts"),
      },
    },
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
          manualChunks(id) {
            if (
              id.includes("/node_modules/.pnpm/phaser@") ||
              id.includes("\\node_modules\\.pnpm\\phaser@") ||
              id.includes("/node_modules/phaser/") ||
              id.includes("\\node_modules\\phaser\\")
            ) {
              return "phaser";
            }

            if (
              id.includes("react-router-dom") ||
              id.includes("react-dom") ||
              id.includes("react/") ||
              id.includes("\\react\\") ||
              id.includes("@tanstack/react-query")
            ) {
              return "react";
            }

            return undefined;
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
