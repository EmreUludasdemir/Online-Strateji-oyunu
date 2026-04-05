import type { CSSProperties, ReactNode } from "react";

import styles from "./CommandSurface.module.css";

type PanelStatTone = "default" | "info" | "success" | "warning" | "danger";

interface SectionHeaderBlockProps {
  kicker?: string;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
  className?: string;
}

export interface PanelStatItem {
  id: string;
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: PanelStatTone;
}

interface PanelStatGridProps {
  items: readonly PanelStatItem[];
  columns?: 1 | 2 | 3 | 4;
  compact?: boolean;
  className?: string;
  containerDataAttribute?: string;
}

export function SectionHeaderBlock({ kicker, title, lead, aside, className }: SectionHeaderBlockProps) {
  return (
    <div className={[styles.sectionHeaderBlock, className].filter(Boolean).join(" ")}>
      <div className={styles.sectionHeaderContent}>
        {kicker ? <p className={styles.sectionKicker}>{kicker}</p> : null}
        <strong className={styles.sectionTitle}>{title}</strong>
        {lead ? <p className={styles.sectionLead}>{lead}</p> : null}
      </div>
      {aside ? <div className={styles.sectionAside}>{aside}</div> : null}
    </div>
  );
}

export function PanelStatGrid({
  items,
  columns = 3,
  compact = false,
  className,
  containerDataAttribute,
}: PanelStatGridProps) {
  const containerProps = containerDataAttribute ? { [containerDataAttribute]: "true" } : {};

  return (
    <div
      {...containerProps}
      className={[styles.panelStatGrid, compact ? styles.panelStatGridCompact : "", className].filter(Boolean).join(" ")}
      style={{ "--panel-stat-columns": String(columns) } as CSSProperties}
    >
      {items.map((item) => (
        <article
          key={item.id}
          className={[
            styles.panelStatCard,
            item.tone ? styles[`panelStatCard${item.tone[0].toUpperCase()}${item.tone.slice(1)}` as keyof typeof styles] : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className={styles.panelStatLabel}>{item.label}</span>
          <strong className={styles.panelStatValue}>{item.value}</strong>
          {item.note ? <span className={styles.panelStatNote}>{item.note}</span> : null}
        </article>
      ))}
    </div>
  );
}
