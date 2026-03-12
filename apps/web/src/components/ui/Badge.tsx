import type { PropsWithChildren } from "react";

import styles from "./primitives.module.css";

type BadgeTone = "info" | "success" | "warning" | "danger";

export function Badge({ tone = "info", children }: PropsWithChildren<{ tone?: BadgeTone }>) {
  const toneClass =
    tone === "success"
      ? styles.badgeSuccess
      : tone === "warning"
        ? styles.badgeWarning
        : tone === "danger"
          ? styles.badgeDanger
          : styles.badgeInfo;

  return <span className={[styles.badge, toneClass].join(" ")}>{children}</span>;
}
