import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

import styles from "./primitives.module.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "small" | "medium" | "large";

interface ButtonProps extends PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "secondary", size = "medium", className, children, ...props }: ButtonProps) {
  const sizeClass = size === "small" ? styles.small : size === "large" ? styles.large : "";
  return (
    <button
      className={[styles.button, styles[variant], sizeClass, className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
