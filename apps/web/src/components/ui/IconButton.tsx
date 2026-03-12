import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

import styles from "./primitives.module.css";

export function IconButton({ className, children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button className={[styles.iconButton, className].filter(Boolean).join(" ")} {...props}>
      {children}
    </button>
  );
}
