import { formatNumber } from "../../lib/formatters";
import styles from "./primitives.module.css";

export function ResourcePill({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.resourcePill}>
      <span className={styles.resourceLabel}>{label}</span>
      <strong className={styles.resourceValue}>{formatNumber(value)}</strong>
    </div>
  );
}
