import type { ReactNode } from "react";
import styles from "./SummaryCard.module.css";

export type SummaryCardTone = "purple" | "green" | "orange" | "neutral";

interface SummaryCardProps {
  label: string;
  icon: ReactNode;
  tone?: SummaryCardTone;
  /** Main value area — a formatted amount, a count, or a status line. */
  children: ReactNode;
  /** Optional small footer, e.g. a refresh action or a sub-label. */
  footer?: ReactNode;
}

export function SummaryCard({ label, icon, tone = "purple", children, footer }: SummaryCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        <span className={`${styles.iconChip} ${styles[tone]}`}>{icon}</span>
      </div>
      <div className={styles.value}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
