import type { ReactNode } from "react";

import { ResourcePill } from "../ui/ResourcePill";
import { Button } from "../ui/Button";
import styles from "../GameLayoutShell.module.css";

export interface QueueSummaryItem {
  id: string;
  label: string;
  value: string;
  hint: string;
}

export function TopHud({
  resources,
  queueItems,
  meta,
  actions,
}: {
  resources: Array<{ label: string; value: number }>;
  queueItems: QueueSummaryItem[];
  meta: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className={styles.topHud}>
      <div className={styles.resourceRow}>
        {resources.map((resource) => (
          <ResourcePill key={resource.label} label={resource.label} value={resource.value} />
        ))}
      </div>
      <div className={styles.metaRow}>
        <div className={styles.queueRail}>
          {queueItems.map((item) => (
            <article key={item.id} className={styles.queueCard}>
              <p className={styles.queueLabel}>{item.label}</p>
              <strong className={styles.queueValue}>{item.value}</strong>
              <p className={styles.queueHint}>{item.hint}</p>
            </article>
          ))}
        </div>
        <div className={styles.desktopOnly}>{meta}</div>
        <div className={styles.quickActions}>{actions}</div>
      </div>
    </div>
  );
}

export function QueueActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="small" onClick={onClick}>
      {label}
    </Button>
  );
}
