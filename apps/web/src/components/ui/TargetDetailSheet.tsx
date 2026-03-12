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
      ? `${target.city.ownerName} · ${target.city.x}, ${target.city.y}`
      : `${target.poi.kind.replaceAll("_", " ")} · ${target.poi.x}, ${target.poi.y}`;

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
            İlerlet
          </Button>
        </>
      }
    >
      <SectionCard kicker="Hedef özeti" title={title} aside={<Badge tone={projectedOutcome === "ATTACKER_WIN" ? "success" : "warning"}>{projectedOutcome === "ATTACKER_WIN" ? "Elverişli" : "Dirençli"}</Badge>}>
        <p>{subtitle}</p>
        {target.kind === "CITY" ? (
          <div style={{ marginTop: "0.85rem", display: "grid", gap: "0.4rem" }}>
            <span>Savunma gücü: {formatNumber(target.city.defensePower)}</span>
            <span>Mesafe: {target.city.distance != null ? `${formatNumber(target.city.distance)} kare` : "-"}</span>
            <span>Sis durumu: {target.city.fogState.toLowerCase()}</span>
          </div>
        ) : (
          <div style={{ marginTop: "0.85rem", display: "grid", gap: "0.4rem" }}>
            <span>Seviye: {target.poi.level}</span>
            <span>Durum: {target.poi.state.toLowerCase()}</span>
            <span>Mesafe: {target.poi.distance != null ? `${formatNumber(target.poi.distance)} kare` : "-"}</span>
            {target.poi.remainingAmount != null ? (
              <span>
                Kalan: {formatNumber(target.poi.remainingAmount)}
                {target.poi.maxAmount != null ? ` / ${formatNumber(target.poi.maxAmount)}` : ""}
              </span>
            ) : null}
          </div>
        )}
      </SectionCard>
    </BottomSheet>
  );
}
