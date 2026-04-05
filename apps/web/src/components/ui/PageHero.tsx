import type { ReactNode } from "react";

import styles from "./PageHero.module.css";

export type SummaryMetricTone = "default" | "info" | "success" | "warning" | "danger";

export interface SummaryMetricItem {
  id?: string;
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: SummaryMetricTone;
}

interface PageHeroProps {
  kicker: ReactNode;
  title: ReactNode;
  lead: ReactNode;
  aside?: ReactNode;
  className?: string;
  children?: ReactNode;
}

interface SummaryMetricGridProps {
  items: readonly SummaryMetricItem[];
  className?: string;
  itemClassName?: string;
  compact?: boolean;
  containerDataAttribute?: string;
  itemDataAttribute?: string;
}

function getToneClass(tone: SummaryMetricTone | undefined) {
  if (tone === "info") {
    return styles.metricCardInfo;
  }
  if (tone === "success") {
    return styles.metricCardSuccess;
  }
  if (tone === "warning") {
    return styles.metricCardWarning;
  }
  if (tone === "danger") {
    return styles.metricCardDanger;
  }
  return "";
}

export function PageHero({ kicker, title, lead, aside, className, children }: PageHeroProps) {
  return (
    <header className={[styles.hero, className].filter(Boolean).join(" ")}>
      <div className={styles.heroTop}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>{kicker}</p>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.lead}>{lead}</p>
        </div>
        {aside ? <div className={styles.aside}>{aside}</div> : null}
      </div>
      {children}
    </header>
  );
}

export function SummaryMetricGrid({
  items,
  className,
  itemClassName,
  compact = false,
  containerDataAttribute,
  itemDataAttribute,
}: SummaryMetricGridProps) {
  const containerProps = containerDataAttribute ? { [containerDataAttribute]: "true" } : {};

  return (
    <div
      className={[styles.metricGrid, compact ? styles.metricGridCompact : "", className].filter(Boolean).join(" ")}
      {...containerProps}
    >
      {items.map((item) => {
        const itemProps = itemDataAttribute && item.id ? { [itemDataAttribute]: item.id } : {};

        return (
          <article
            key={item.id ?? String(item.label)}
            className={[
              styles.metricCard,
              compact ? styles.metricCardCompact : "",
              getToneClass(item.tone),
              itemClassName,
            ]
              .filter(Boolean)
              .join(" ")}
            {...itemProps}
          >
            <span className={styles.metricLabel}>{item.label}</span>
            <strong className={styles.metricValue}>{item.value}</strong>
            {item.note ? <span className={styles.metricNote}>{item.note}</span> : null}
          </article>
        );
      })}
    </div>
  );
}
