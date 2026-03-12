import type { ReactNode } from "react";

import styles from "./primitives.module.css";

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className={styles.emptyState}>
      <strong className={styles.emptyTitle}>{title}</strong>
      <p className={styles.emptyBody}>{body}</p>
      {action ? <div style={{ marginTop: "0.9rem" }}>{action}</div> : null}
    </div>
  );
}
