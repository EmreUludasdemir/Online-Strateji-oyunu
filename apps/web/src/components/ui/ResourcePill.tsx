import { formatNumber } from "../../lib/formatters";
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
  return normalized in RESOURCE_ICONS ? (normalized as ResourceKind) : undefined;
}

export function ResourcePill({
  label,
  value,
  kind,
}: {
  label: string;
  value: number;
  kind?: ResourceKind;
}) {
  const resolvedKind = resolveKind(label, kind);
  const iconSrc = resolvedKind ? RESOURCE_ICONS[resolvedKind] : undefined;
  return (
    <div className={styles.resourcePill} data-resource={resolvedKind}>
      <div className={styles.resourcePillLeading}>
        {iconSrc ? (
          <img src={iconSrc} alt="" aria-hidden="true" className={styles.resourceIcon} />
        ) : null}
        <span className={styles.resourceLabel}>{label}</span>
      </div>
      <strong className={styles.resourceValue}>{formatNumber(value)}</strong>
    </div>
  );
}
