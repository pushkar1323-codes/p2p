import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Honest "nothing to show" state, used instead of fabricated data
 * wherever the application genuinely has no value to display (e.g.
 * wallet disconnected, no loan looked up yet).
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.container}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
