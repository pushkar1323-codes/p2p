"use client";

import { useState } from "react";
import styles from "./page.module.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { DashboardOverview } from "@/components/sections/DashboardOverview";
import { LoanRegistrySection } from "@/components/sections/LoanRegistrySection";
import { WalletSection } from "@/components/sections/WalletSection";
import type { DashboardSection } from "@/components/layout/navigation";
import { useWallet } from "@/hooks/useWallet";
import { useXlmBalance } from "@/hooks/useXlmBalance";
import { useLoanCount } from "@/hooks/useLoanCount";
import { stellarConfig } from "@/config/stellar";

const SECTION_META: Record<DashboardSection, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Dashboard",
    subtitle: "An overview of your wallet and the loan_registry contract.",
  },
  loans: {
    title: "Loan Registry",
    subtitle: "Create, cancel and look up loan requests on Stellar Testnet.",
  },
  wallet: {
    title: "Wallet",
    subtitle: "Your Testnet XLM balance and transfers.",
  },
};

export default function Home() {
  const [activeSection, setActiveSection] = useState<DashboardSection>("dashboard");
  const [navOpen, setNavOpen] = useState(false);

  // Single shared sessions — owned here and passed down as props, so
  // no section creates a second wallet/balance/loan-count instance
  // (preserves the existing L1/L2 architecture).
  const wallet = useWallet();
  const connectedAddress = wallet.status === "connected" ? wallet.address : null;
  const balance = useXlmBalance(connectedAddress);
  const loanCount = useLoanCount();

  function navigate(section: DashboardSection) {
    setActiveSection(section);
    setNavOpen(false);
  }

  const meta = SECTION_META[activeSection];

  return (
    <div className={styles.shell}>
      <Sidebar
        activeSection={activeSection}
        onNavigate={navigate}
        isOpen={navOpen}
        onClose={() => setNavOpen(false)}
        networkLabel={`Stellar ${stellarConfig.network === "TESTNET" ? "Testnet" : stellarConfig.network}`}
      />

      <div className={styles.main}>
        <Header
          title={meta.title}
          subtitle={meta.subtitle}
          wallet={wallet}
          onOpenNav={() => setNavOpen(true)}
        />

        <div className={styles.content}>
          {activeSection === "dashboard" && (
            <DashboardOverview
              wallet={wallet}
              balance={balance}
              loanCount={loanCount}
              onNavigate={navigate}
            />
          )}

          {activeSection === "loans" && (
            <LoanRegistrySection wallet={wallet} onLoanCountChange={loanCount.refresh} />
          )}

          {activeSection === "wallet" && <WalletSection wallet={wallet} balance={balance} />}
        </div>
      </div>
    </div>
  );
}
