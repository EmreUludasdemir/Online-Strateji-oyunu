import type { PropsWithChildren, ReactNode } from "react";

import styles from "./primitives.module.css";

interface SectionCardProps extends PropsWithChildren {
  kicker?: string;
  title?: string;
  aside?: ReactNode;
  className?: string;
}

export function SectionCard({ kicker, title, aside, className, children }: SectionCardProps) {
  return (
    <article className={[styles.sectionCard, className].filter(Boolean).join(" ")}>
      {kicker || title || aside ? (
        <header className={styles.sectionHeader}>
          <div>
            {kicker ? <p className={styles.sectionKicker}>{kicker}</p> : null}
            {title ? <h3 className={styles.sectionTitle}>{title}</h3> : null}
          </div>
          {aside}
        </header>
      ) : null}
      <div className={styles.sectionBody}>{children}</div>
    </article>
  );
}
