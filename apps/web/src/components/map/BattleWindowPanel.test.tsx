import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BattleWindowPanel } from "./BattleWindowPanel";

describe("BattleWindowPanel", () => {
  it("renders attacker, defender, and participant details", () => {
    const html = renderToStaticMarkup(
      <BattleWindowPanel
        now={Date.now()}
        allianceTag="BRZ"
        battleWindow={{
          id: "window-1",
          objective: "BARBARIAN_ATTACK",
          targetKind: "POI",
          targetCityId: null,
          targetPoiId: "poi-1",
          label: "Barbarian Camp 2",
          attackerLabel: "Ashwatch",
          defenderLabel: "Barbarian Camp 2",
          closesAt: new Date(Date.now() + 20_000).toISOString(),
          remainingSeconds: 20,
          participantCount: 2,
          participants: [
            {
              marchId: "march-a",
              ownerUserId: "user-a",
              ownerName: "demo_alpha",
              ownerAllianceTag: "BRZ",
              commanderName: "Marshal Ilyas",
              troops: { INFANTRY: 12, ARCHER: 0, CAVALRY: 4 },
              objective: "BARBARIAN_ATTACK",
              etaAt: new Date(Date.now() + 12_000).toISOString(),
            },
            {
              marchId: "march-b",
              ownerUserId: "user-b",
              ownerName: "demo_beta",
              ownerAllianceTag: "BRZ",
              commanderName: "Nara",
              troops: { INFANTRY: 8, ARCHER: 8, CAVALRY: 0 },
              objective: "BARBARIAN_ATTACK",
              etaAt: new Date(Date.now() + 14_000).toISOString(),
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Barbarian Camp 2");
    expect(html).toContain("Alliance support");
    expect(html).toContain("demo_alpha");
    expect(html).toContain("Marshal Ilyas");
  });
});
