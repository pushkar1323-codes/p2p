"use client";

import { GridIcon, LoanIcon, WalletIcon, ListIcon, UserIcon, CloseIcon, P2PMark } from "@/components/ui/icons";
import { NAV_ITEMS, type DashboardSection } from "./navigation";
import styles from "./Sidebar.module.css";

const ICONS: Record<DashboardSection, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  dashboard: GridIcon,
  marketplace: ListIcon,
  "my-loans": UserIcon,
  loans: LoanIcon,
  wallet: WalletIcon,
};

interface SidebarProps {
  activeSection: DashboardSection;
  onNavigate: (section: DashboardSection) => void;
  isOpen: boolean;
  onClose: () => void;
  networkLabel: string;
}

export function Sidebar({ activeSection, onNavigate, isOpen, onClose, networkLabel }: SidebarProps) {
  return (
    <>
      {isOpen && (
        <button
          type="button"
          className={styles.overlay}
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ""}`}>
        <div className={styles.top}>
          <div className={styles.brandRow}>
            <div className={styles.brand}>
              <span className={styles.mark}>
                <P2PMark />
              </span>
              <span className={styles.wordmark}>P2P</span>
            </div>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Close navigation"
            >
              <CloseIcon />
            </button>
          </div>
          <p className={styles.tagline}>Peer-to-peer lending, powered by Stellar.</p>
        </div>

        <nav className={styles.nav} aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.id];
            const active = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                onClick={() => onNavigate(item.id)}
                aria-current={active ? "page" : undefined}
              >
                <Icon width={18} height={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className={styles.footer}>
          <span className={styles.networkDot} aria-hidden="true" />
          <span>{networkLabel}</span>
        </div>
      </aside>
    </>
  );
}
