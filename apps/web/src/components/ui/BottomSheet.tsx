import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useRef } from "react";

import styles from "./BottomSheet.module.css";

export interface BottomSheetAction {
  id: string;
  label: string;
  onClick: () => void;
  tone?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
}

export function BottomSheet({
  open,
  title,
  children,
  onClose,
  actions,
  mode = "bottom",
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  mode?: "bottom" | "aside";
}) {
  const labelId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const focusableSelector = useMemo(
    () => 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    [],
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = sheetRef.current?.querySelector<HTMLElement>(focusableSelector);
    focusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !sheetRef.current) {
        return;
      }

      const nodes = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (node) => !node.hasAttribute("disabled"),
      );
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [focusableSelector, onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <>
      <button className={styles.overlay} type="button" aria-label="Katmani kapat" onClick={onClose} />
      <div
        ref={sheetRef}
        className={[styles.sheet, mode === "aside" ? styles.desktopAside : ""].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
      >
        <div className={styles.handle} />
        <header className={styles.header}>
          <h2 id={labelId} className={styles.title}>
            {title}
          </h2>
          <button className={styles.close} type="button" onClick={onClose} aria-label="Kapat">
            x
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {actions ? <footer className={styles.actions}>{actions}</footer> : null}
      </div>
    </>
  );
}
