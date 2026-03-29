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
  brand,
  resources,
  actions,
}: {
  brand?: ReactNode;
  resources: Array<{ label: string; value: number }>;
  actions: ReactNode;
}) {
  return (
    <header className={styles.topHud}>
      {brand && <div className={styles.topBrand}>{brand}</div>}
      <div className={styles.resourceRow}>
        {resources.map((resource) => (
          <ResourcePill key={resource.label} label={resource.label} value={resource.value} />
        ))}
      </div>
      <div className={styles.quickActions}>{actions}</div>
    </header>
  );
}

export function QueueActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="small" onClick={onClick}>
      {label}
    </Button>
  );
}
