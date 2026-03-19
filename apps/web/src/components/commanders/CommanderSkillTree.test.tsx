import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CommanderSkillTree } from "./CommanderSkillTree";

describe("CommanderSkillTree", () => {
  it("renders active doctrine details and talent point state", () => {
    const html = renderToStaticMarkup(
      <CommanderSkillTree
        commander={{
          id: "cmd-1",
          name: "Marshal Ilyas",
          templateKey: "marshal_ilyas",
          level: 5,
          xp: 180,
          xpToNextLevel: 120,
          starLevel: 2,
          talentTrack: "CONQUEST",
          talentPointsSpent: 3,
          assignedPreset: "Conquest Vanguard",
          attackBonusPct: 12,
          defenseBonusPct: 8,
          marchSpeedBonusPct: 5,
          carryBonusPct: 4,
          isPrimary: true,
          totalPowerScore: 62,
          xpForCurrentLevel: 180,
          xpForNextLevel: 300,
          talentPointsAvailable: 1,
          skillTree: {
            track: "CONQUEST",
            trackLabel: "Conquest",
            availablePoints: 1,
            nodes: [
              {
                id: "spearhead",
                label: "Spearhead",
                description: "Sharpens the first impact of assault marches.",
                tier: 1,
                lane: 0,
                icon: "sword",
                unlocked: true,
                active: true,
                requiredPoints: 0,
                bonusLabel: "+4% opening attack",
              },
              {
                id: "war-drum",
                label: "War Drum",
                description: "Keeps infantry pressure steady after first contact.",
                tier: 1,
                lane: 1,
                icon: "drum",
                unlocked: true,
                active: false,
                requiredPoints: 1,
                bonusLabel: "+3% infantry pressure",
              },
            ],
            links: [{ from: "spearhead", to: "war-drum" }],
          },
        }}
      />,
    );

    expect(html).toContain("Talent Tree");
    expect(html).toContain("Conquest");
    expect(html).toContain("Selected Doctrine");
    expect(html).toContain("Spearhead");
  });
});
