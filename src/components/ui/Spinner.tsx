import styles from "./Spinner.module.css";

interface SpinnerProps {
  label?: string;
  size?: "sm" | "md";
}

export function Spinner({ label, size = "md" }: SpinnerProps) {
  return (
    <span className={styles.wrap} role="status" aria-live="polite">
      <span className={`${styles.spinner} ${styles[size]}`} aria-hidden="true" />
      {label && <span className={styles.label}>{label}</span>}
    </span>
  );
}
