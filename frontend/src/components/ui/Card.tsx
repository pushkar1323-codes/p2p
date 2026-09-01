import type { ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Removes internal padding, for cards that manage their own layout. */
  noPadding?: boolean;
}

export function Card({ children, className, noPadding }: CardProps) {
  const classes = [styles.card, noPadding ? styles.noPadding : ""]
    .concat(className ?? "")
    .filter(Boolean)
    .join(" ");
  return <div className={classes}>{children}</div>;
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

export function CardHeader({ title, description, action, icon }: CardHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.headerText}>
        {icon && <span className={styles.headerIcon}>{icon}</span>}
        <div>
          <h2 className={styles.title}>{title}</h2>
          {description && <p className={styles.description}>{description}</p>}
        </div>
      </div>
      {action && <div className={styles.headerAction}>{action}</div>}
    </div>
  );
}
