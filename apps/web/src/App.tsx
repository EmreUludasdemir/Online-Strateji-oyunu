import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ApiClientError } from "./api";
import { AuthPage } from "./components/AuthPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { GameLayout } from "./components/GameLayout";
import { ThemeProvider } from "./components/ThemeProvider";
import { DashboardPage } from "./pages/DashboardPage";

const MapPage = lazy(async () => {
  const module = await import("./pages/MapPage");
  return { default: module.MapPage };
});

const ReportsPage = lazy(async () => {
  const module = await import("./pages/ReportsPage");
  return { default: module.ReportsPage };
});

const AlliancePage = lazy(async () => {
  const module = await import("./pages/AlliancePage");
  return { default: module.AlliancePage };
});

const AllianceRolesPage = lazy(async () => {
  const module = await import("./pages/AllianceRolesPage");
  return { default: module.AllianceRolesPage };
});

const CommanderPage = lazy(async () => {
  const module = await import("./pages/CommanderPage");
  return { default: module.CommanderPage };
});

const ResearchPage = lazy(async () => {
  const module = await import("./pages/ResearchPage");
  return { default: module.ResearchPage };
});

const LeaderboardPage = lazy(async () => {
  const module = await import("./pages/LeaderboardPage");
  return { default: module.LeaderboardPage };
});

const MessageCenterPage = lazy(async () => {
  const module = await import("./pages/MessageCenterPage");
  return { default: module.MessageCenterPage };
});

const MarketPage = lazy(async () => {
  const module = await import("./pages/MarketPage");
  return { default: module.MarketPage };
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry(failureCount, error) {
        if (error instanceof ApiClientError && error.status < 500) {
          return false;
        }

        return failureCount < 2;
      },
      staleTime: 5_000,
    },
  },
});

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
                  <Route path="/login" element={<AuthPage mode="login" />} />
                  <Route path="/register" element={<AuthPage mode="register" />} />
                  <Route path="/app" element={<GameLayout />}>
                    <Route index element={<Navigate to="/app/dashboard" replace />} />
                    <Route path="dashboard" element={<DashboardPage />} />
                    <Route path="research" element={<ResearchPage />} />
                    <Route path="commanders" element={<CommanderPage />} />
                    <Route path="map" element={<MapPage />} />
                    <Route path="reports" element={<ReportsPage />} />
                    <Route path="leaderboards" element={<LeaderboardPage />} />
                    <Route path="messages" element={<MessageCenterPage />} />
                    <Route path="market" element={<MarketPage />} />
                    <Route path="alliance" element={<AlliancePage />} />
                    <Route path="alliance/roles" element={<AllianceRolesPage />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

function LoadingFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        background:
          "radial-gradient(circle at 14% 10%, rgba(233, 193, 118, 0.08), transparent 20%), var(--surface-shell-bg)",
        color: "var(--color-on-surface-variant)",
      }}
    >
      <div
        style={{
          minWidth: "min(420px, 100%)",
          padding: "1.5rem",
          borderRadius: "var(--radius-sm)",
          background: "var(--surface-hero-panel)",
          boxShadow: "var(--shadow-heavy), inset 0 0 0 1px var(--color-panel-line)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "1.75rem", marginBottom: "0.65rem", color: "var(--color-primary-fixed)" }}>⏳</div>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: "1.2rem",
            fontStyle: "italic",
            color: "var(--color-primary-fixed)",
          }}
        >
          Preparing the command hall
        </p>
        <p style={{ margin: "0.45rem 0 0", lineHeight: 1.6 }}>
          Loading routes, reports, and frontier state.
        </p>
      </div>
    </div>
  );
}
