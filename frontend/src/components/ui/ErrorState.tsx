import type { ReactNode } from "react";
import { AlertIcon } from "./icons";
import styles from "./ErrorState.module.css";

interface ErrorStateProps {
  message: string;
  action?: ReactNode;
}

/**
 * A general-purpose "this failed to load" state — distinct from
 * `EmptyState` (which means "loaded successfully, nothing to show").
 * Used wherever a contract/backend read genuinely failed (Browse
 * Loans, My Loans, Loan Details), so failures get a consistent
 * look instead of each section inventing its own error box.
 */
export function ErrorState({ message, action }: ErrorStateProps) {
  return (
    <div className={styles.container} role="alert">
      <AlertIcon width={18} height={18} />
      <span className={styles.message}>{message}</span>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
