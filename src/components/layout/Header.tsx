"use client";

import type { ReactNode } from "react";
import { MenuIcon } from "@/components/ui/icons";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import type { UseWalletResult } from "@/hooks/useWallet";
import styles from "./Header.module.css";

interface HeaderProps {
  title: string;
  subtitle?: ReactNode;
  wallet: UseWalletResult;
  onOpenNav: () => void;
}

export function Header({ title, subtitle, wallet, onOpenNav }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={onOpenNav}
          aria-label="Open navigation"
        >
          <MenuIcon />
        </button>
        <div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>

      <div className={styles.right}>
        <ConnectWalletButton {...wallet} />
      </div>
    </header>
  );
}
