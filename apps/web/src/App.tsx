import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ApiClientError } from "./api";
import { AuthPage } from "./components/AuthPage";
import { GameLayout } from "./components/GameLayout";
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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>Loading route...</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/app" element={<GameLayout />}>
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="map" element={<MapPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="alliance" element={<AlliancePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
