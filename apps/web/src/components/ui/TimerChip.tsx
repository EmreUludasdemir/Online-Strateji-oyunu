import { formatRelativeTimer } from "../../lib/formatters";
import styles from "./primitives.module.css";

export function TimerChip({ endsAt, now }: { endsAt: string; now: number }) {
  return <span className={styles.timerChip}>{formatRelativeTimer(endsAt, now)}</span>;
}
