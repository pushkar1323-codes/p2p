"use client";

import type { ReactNode } from "react";
import {
  SendIcon,
  PlusIcon,
  SearchIcon,
  CancelActionIcon,
  RefreshIcon,
  WalletIcon,
} from "@/components/ui/icons";
import type { DashboardSection } from "@/components/layout/navigation";
import type { WalletStatus } from "@/lib/wallet/types";
import styles from "./QuickActions.module.css";

interface QuickActionsProps {
  walletStatus: WalletStatus;
  onNavigate: (section: DashboardSection) => void;
  onConnect: () => void;
  onRefreshBalance: () => void;
}

interface Action {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
}

export function QuickActions({
  walletStatus,
  onNavigate,
  onConnect,
  onRefreshBalance,
}: QuickActionsProps) {
  const connected = walletStatus === "connected";

  const actions: Action[] = [
    ...(!connected
      ? [
          {
            id: "connect",
            label: "Connect Wallet",
            description: "Link Freighter, Albedo or xBull",
            icon: <WalletIcon width={18} height={18} />,
            onClick: onConnect,
          },
        ]
      : [
          {
            id: "refresh-balance",
            label: "Refresh Balance",
            description: "Re-check your XLM balance",
            icon: <RefreshIcon width={18} height={18} />,
            onClick: onRefreshBalance,
          },
        ]),
    {
      id: "send",
      label: "Send XLM",
      description: "Transfer Testnet XLM to another address",
      icon: <SendIcon width={18} height={18} />,
      onClick: () => onNavigate("wallet"),
    },
    {
      id: "create-loan",
      label: "Create Loan Request",
      description: "Request funding from the network",
      icon: <PlusIcon width={18} height={18} />,
      onClick: () => onNavigate("loans"),
    },
    {
      id: "read-loan",
      label: "Read Loan",
      description: "Look up a loan request by ID",
      icon: <SearchIcon width={18} height={18} />,
      onClick: () => onNavigate("loans"),
    },
    {
      id: "cancel-loan",
      label: "Cancel Loan Request",
      description: "Cancel a loan request you created",
      icon: <CancelActionIcon width={18} height={18} />,
      onClick: () => onNavigate("loans"),
    },
  ];

  return (
    <div className={styles.grid}>
      {actions.map((action) => (
        <button key={action.id} type="button" className={styles.tile} onClick={action.onClick}>
          <span className={styles.icon}>{action.icon}</span>
          <span className={styles.text}>
            <span className={styles.label}>{action.label}</span>
            <span className={styles.description}>{action.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
