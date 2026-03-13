import type { MapCity, PoiView } from "@frontier/shared";

import { formatNumber } from "../../lib/formatters";
import { copy } from "../../lib/i18n";
import { Badge } from "./Badge";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { SectionCard } from "./SectionCard";

type TargetUnion =
  | {
      kind: "CITY";
      city: MapCity;
    }
  | {
      kind: "POI";
      poi: PoiView;
    };

export function TargetDetailSheet({
  open,
  target,
  projectedOutcome,
  onClose,
  onProceed,
  onScout,
  onRally,
}: {
  open: boolean;
  target: TargetUnion | null;
  projectedOutcome: string | null;
  onClose: () => void;
  onProceed: () => void;
  onScout: () => void;
  onRally?: (() => void) | null;
}) {
  if (!target) {
    return null;
  }

  const title = target.kind === "CITY" ? target.city.cityName : target.poi.label;
  const subtitle =
    target.kind === "CITY"
      ? `${target.city.ownerName} | ${target.city.x}, ${target.city.y}`
      : `${target.poi.kind.replaceAll("_", " ")} | ${target.poi.x}, ${target.poi.y}`;

  return (
    <BottomSheet
      open={open}
      title={`${copy.map.targetDetail}: ${title}`}
      onClose={onClose}
      actions={
        <>
          <Button type="button" variant="secondary" onClick={onScout}>
            {copy.map.scout}
          </Button>
          {onRally ? (
            <Button type="button" variant="ghost" onClick={onRally}>
              {copy.map.rally}
            </Button>
          ) : null}
          <Button type="button" variant="primary" onClick={onProceed}>
            Proceed
          </Button>
        </>
      }
    >
      <SectionCard
        kicker="Target Overview"
        title={title}
        aside={
          <Badge tone={projectedOutcome === "ATTACKER_WIN" ? "success" : "warning"}>
            {projectedOutcome === "ATTACKER_WIN" ? "Favorable" : "Resistant"}
          </Badge>
        }
      >
        <p>{subtitle}</p>
        {target.kind === "CITY" ? (
          <div style={{ marginTop: "0.85rem", display: "grid", gap: "0.4rem" }}>
            <span>Defense Power: {formatNumber(target.city.defensePower)}</span>
            <span>Distance: {target.city.distance != null ? `${formatNumber(target.city.distance)} tiles` : "-"}</span>
            <span>Fog State: {target.city.fogState.toLowerCase()}</span>
          </div>
        ) : (
          <div style={{ marginTop: "0.85rem", display: "grid", gap: "0.4rem" }}>
            <span>Level: {target.poi.level}</span>
            <span>State: {target.poi.state.toLowerCase()}</span>
            <span>Distance: {target.poi.distance != null ? `${formatNumber(target.poi.distance)} tiles` : "-"}</span>
            {target.poi.remainingAmount != null ? (
              <span>
                Remaining: {formatNumber(target.poi.remainingAmount)}
                {target.poi.maxAmount != null ? ` / ${formatNumber(target.poi.maxAmount)}` : ""}
              </span>
            ) : null}
          </div>
        )}
      </SectionCard>
    </BottomSheet>
  );
}
