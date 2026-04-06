import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./styles/global.css";

const runtimeGlobal = globalThis as typeof globalThis & { global?: typeof globalThis };

// Phaser's lazy-loaded browser runtime still expects a Node-style `global`.
if (typeof runtimeGlobal.global === "undefined") {
  runtimeGlobal.global = globalThis;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
