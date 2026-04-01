// @vitest-environment jsdom

import type { PublicBootstrapResponse } from "@frontier/shared";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { AuthPage } from "./AuthPage";
import { copy } from "../lib/i18n";
import { cleanupRendered, createTestQueryClient, flushUi, renderInDom } from "../test/testHarness";

const closedAlphaBootstrap: PublicBootstrapResponse = {
  launchPhase: "closed_alpha",
  registrationMode: "login_only",
  storeEnabled: false,
};

function LocationProbe() {
  const location = useLocation();
  return <div data-pathname={location.pathname}>{location.pathname}</div>;
}

async function renderAuthRoute(initialEntry: "/login" | "/register") {
  const client = createTestQueryClient();
  client.setQueryData(["public-bootstrap"], closedAlphaBootstrap);
  client.setQueryData(["session"], { user: null });

  return renderInDom(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/login"
            element={
              <>
                <LocationProbe />
                <AuthPage mode="login" />
              </>
            }
          />
          <Route
            path="/register"
            element={
              <>
                <LocationProbe />
                <AuthPage mode="register" />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AuthPage closed alpha guards", () => {
  let view: Awaited<ReturnType<typeof renderAuthRoute>> | null = null;

  afterEach(async () => {
    await cleanupRendered(view);
    view = null;
  });

  it("hides demo banners and public signup on the login route", async () => {
    view = await renderAuthRoute("/login");
    await flushUi();

    expect(view.container.textContent).toContain("Closed Alpha");
    expect(view.container.textContent).toContain("Operator-provisioned access");
    expect(view.container.textContent).toContain("Access Policy");
    expect(view.container.textContent).not.toContain("Go to register");
    expect(view.container.querySelectorAll("[data-demo-login]")).toHaveLength(0);
  });

  it("redirects the register route back to /login when registration is closed", async () => {
    view = await renderAuthRoute("/register");
    await flushUi();

    expect(view.container.querySelector("[data-pathname]")?.textContent).toBe("/login");
    expect(view.container.textContent).toContain(copy.auth.loginTitle);
    expect(view.container.textContent).not.toContain(copy.auth.registerTitle);
  });
});
