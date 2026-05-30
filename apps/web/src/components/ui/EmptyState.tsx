import type { ReactNode } from "react";

import styles from "./primitives.module.css";

export function EmptyState({ title, body, action, icon = "info" }: { title: string; body: string; action?: ReactNode; icon?: string }) {
  return (
    <div className={styles.emptyState}>
      {icon && <span className={`material-symbols-outlined ${styles.emptyIcon}`}>{icon}</span>}
      <strong className={styles.emptyTitle}>{title}</strong>
      <p className={styles.emptyBody}>{body}</p>
      {action ? <div style={{ marginTop: "1.25rem" }}>{action}</div> : null}
    </div>
  );
}
