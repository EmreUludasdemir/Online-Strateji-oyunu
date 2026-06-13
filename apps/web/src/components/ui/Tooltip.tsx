import React, { useState, useRef, useEffect, ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./Tooltip.module.css";

interface TooltipProps {
  content: ReactNode;
  children: React.ReactElement;
  delayEnter?: number;
  delayLeave?: number;
}

export function Tooltip({ content, children, delayEnter = 300, delayLeave = 150 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isAbove, setIsAbove] = useState(false);
  
  const triggerRef = useRef<HTMLElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let top = rect.bottom + window.scrollY + 8;
        let left = rect.left + window.scrollX + (rect.width / 2);
        let above = false;

        // Simple vertical collision logic
        if (rect.bottom + 120 > viewportHeight) {
          top = rect.top + window.scrollY - 8;
          above = true;
        }

        // Keep horizontal within bounds (assume max-width ~320px, so 160px half)
        if (left + 160 > viewportWidth) {
          left = viewportWidth - 160 - 16; // 16px padding
        } else if (left - 160 < 0) {
          left = 160 + 16;
        }

        setPosition({ top, left });
        setIsAbove(above);
        setIsVisible(true);
      }
    }, delayEnter);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, delayLeave);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!content) return children;

  const child = React.Children.only(children);
  const clonedChild = React.cloneElement(child as any, {
    ref: triggerRef,
    onMouseEnter: (e: any) => {
      handleMouseEnter();
      if ((child as any).props.onMouseEnter) (child as any).props.onMouseEnter(e);
    },
    onMouseLeave: (e: any) => {
      handleMouseLeave();
      if ((child as any).props.onMouseLeave) (child as any).props.onMouseLeave(e);
    },
    onFocus: (e: any) => {
      handleMouseEnter();
      if ((child as any).props.onFocus) (child as any).props.onFocus(e);
    },
    onBlur: (e: any) => {
      handleMouseLeave();
      if ((child as any).props.onBlur) (child as any).props.onBlur(e);
    },
  });

  return (
    <>
      {clonedChild}
      {isVisible &&
        createPortal(
          <div className={styles.tooltipPortal}>
            <div
              className={[styles.tooltipContent, isAbove ? styles.above : ""].filter(Boolean).join(" ")}
              style={{
                top: position.top,
                left: position.left,
              }}
            >
              {content}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// Pre-styled content blocks for the Tooltip
export function TooltipTitle({ children }: { children: ReactNode }) {
  return <strong className={styles.title}>{children}</strong>;
}

export function TooltipBody({ children }: { children: ReactNode }) {
  return <p className={styles.body}>{children}</p>;
}

export function TooltipMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.metricRow}>
      <span className={styles.metricLabel}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
