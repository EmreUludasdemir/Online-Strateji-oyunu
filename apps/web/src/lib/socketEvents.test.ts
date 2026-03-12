import { describe, expect, it } from "vitest";

import { getInvalidationKeys, getSocketToast, parseSocketEvent } from "./socketEvents";

describe("socketEvents", () => {
  it("parses known socket events", () => {
    expect(parseSocketEvent({ type: "battle.resolved" })).toEqual({ type: "battle.resolved" });
    expect(parseSocketEvent({ type: "unknown.event" })).toBeNull();
  });

  it("returns invalidation keys for report and march updates", () => {
    expect(getInvalidationKeys("report.created")).toEqual([["battle-reports"], ["game-state"], ["world-chunk"]]);
    expect(getInvalidationKeys("march.updated")).toEqual([["world-chunk"]]);
  });

  it("maps selected socket events to toast copy", () => {
    expect(getSocketToast("upgrade.completed")).toEqual({
      tone: "success",
      title: "Insa tamamlandi",
      body: "Yeni bolge yukseltmesi divanda kullanima acildi.",
    });
    expect(getSocketToast("map.updated")).toBeNull();
  });
});
