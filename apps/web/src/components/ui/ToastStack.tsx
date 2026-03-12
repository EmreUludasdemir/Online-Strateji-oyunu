import { useEffect } from "react";

import styles from "./ToastStack.module.css";

export interface ToastItem {
  id: string;
  tone: "success" | "info" | "warning" | "error";
  title: string;
  body: string;
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        onDismiss(toast.id);
      }, 4200),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [onDismiss, toasts]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className={styles.stack} aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={[styles.toast, styles[toast.tone]].join(" ")} role="status">
          <div className={styles.header}>
            <strong className={styles.title}>{toast.title}</strong>
            <button className={styles.dismiss} type="button" onClick={() => onDismiss(toast.id)} aria-label="Bildirimi kapat">
              ×
            </button>
          </div>
          <p className={styles.body}>{toast.body}</p>
        </div>
      ))}
    </div>
  );
}
