"use client";

import styles from "./page.module.css";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { XlmBalance } from "@/components/wallet/XlmBalance";
import { TransferForm } from "@/components/wallet/TransferForm";
import { useWallet } from "@/hooks/useWallet";
import { useXlmBalance } from "@/hooks/useXlmBalance";

export default function Home() {
  const wallet = useWallet();
  const connectedAddress = wallet.status === "connected" ? wallet.address : null;
  const balance = useXlmBalance(connectedAddress);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <span className={styles.brand}>P2P</span>
          <span className={styles.tagline}>
            Peer-to-peer lending, powered by Stellar.
          </span>
        </header>

        <section className={styles.walletSection}>
          <ConnectWalletButton {...wallet} />
          <XlmBalance walletStatus={wallet.status} balance={balance} />
        </section>

        <TransferForm
          status={wallet.status}
          address={wallet.address}
          availableBalance={balance.balance}
          onSent={balance.refresh}
        />
      </main>
    </div>
  );
}
