import { formatNumber } from "../../lib/formatters";
import { Tooltip } from "./Tooltip";
import styles from "./primitives.module.css";

export type ResourceKind = "wood" | "stone" | "food" | "gold";

const RESOURCE_ICONS: Record<ResourceKind, string> = {
  wood: "/assets/icons/resources/wood.svg",
  stone: "/assets/icons/resources/stone.svg",
  food: "/assets/icons/resources/food.svg",
  gold: "/assets/icons/resources/gold.svg",
};

function resolveKind(label: string, explicit?: ResourceKind): ResourceKind | undefined {
  if (explicit) return explicit;
  const normalized = label.trim().toLowerCase();
  const localizedKinds: Record<string, ResourceKind> = {
    odun: "wood",
    tas: "stone",
    taş: "stone",
    erzak: "food",
    yiyecek: "food",
    altin: "gold",
    altın: "gold",
  };
  if (normalized in localizedKinds) return localizedKinds[normalized];
  return normalized in RESOURCE_ICONS ? (normalized as ResourceKind) : undefined;
}

export function ResourcePill({
  label,
  value,
  kind,
  compact = false,
  tooltip,
}: {
  label: string;
  value: number;
  kind?: ResourceKind;
  compact?: boolean;
  tooltip?: React.ReactNode;
}) {
  const resolvedKind = resolveKind(label, kind);
  const iconSrc = resolvedKind ? RESOURCE_ICONS[resolvedKind] : undefined;
  
  const pill = (
    <div
      className={[styles.resourcePill, compact ? styles.resourcePillCompact : ""].filter(Boolean).join(" ")}
      data-resource={resolvedKind}
      aria-label={`${label}: ${formatNumber(value)}`}
    >
      <div className={styles.resourcePillLeading}>
        {iconSrc ? (
          <img src={iconSrc} alt="" aria-hidden="true" className={styles.resourceIcon} />
        ) : null}
        <span className={styles.resourceLabel} aria-hidden={compact}>
          {label}
        </span>
      </div>
      <strong className={styles.resourceValue}>{formatNumber(value)}</strong>
    </div>
  );

  if (tooltip) {
    return <Tooltip content={tooltip}>{pill}</Tooltip>;
  }

  return pill;
}
