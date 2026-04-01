// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("../components/GameLayout", () => ({
  useGameLayoutContext: vi.fn(),
}));

import { useGameLayoutContext } from "../components/GameLayout";
import { MarketPage } from "./MarketPage";
import { cleanupRendered, flushUi, renderInDom } from "../test/testHarness";

function LocationProbe() {
  const location = useLocation();
  return <div data-pathname={location.pathname}>{location.pathname}</div>;
}

describe("MarketPage release guards", () => {
  let view: Awaited<ReturnType<typeof renderInDom>> | null = null;

  afterEach(async () => {
    vi.mocked(useGameLayoutContext).mockReset();
    await cleanupRendered(view);
    view = null;
  });

  it("redirects to the dashboard when the store is disabled", async () => {
    vi.mocked(useGameLayoutContext).mockReturnValue({
      bootstrap: { storeEnabled: false },
      state: {},
    } as never);

    view = await renderInDom(
      <MemoryRouter initialEntries={["/app/market"]}>
        <Routes>
          <Route
            path="/app/dashboard"
            element={
              <>
                <LocationProbe />
                <div>Dashboard landing</div>
              </>
            }
          />
          <Route path="/app/market" element={<MarketPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await flushUi();

    expect(view.container.querySelector("[data-pathname]")?.textContent).toBe("/app/dashboard");
    expect(view.container.textContent).toContain("Dashboard landing");
  });
});
