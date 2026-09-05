"use client";

import { useState } from "react";
import styles from "./page.module.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { DashboardOverview } from "@/components/sections/DashboardOverview";
import { LoanRegistrySection } from "@/components/sections/LoanRegistrySection";
import { BrowseLoansSection } from "@/components/sections/BrowseLoansSection";
import { MyLoansSection } from "@/components/sections/MyLoansSection";
import { LoanDetailSection } from "@/components/sections/LoanDetailSection";
import { ActivitySection } from "@/components/sections/ActivitySection";
import { TransactionsSection } from "@/components/sections/TransactionsSection";
import { WalletSection } from "@/components/sections/WalletSection";
import { ProfileSection } from "@/components/sections/ProfileSection";
import { SettingsSection } from "@/components/sections/SettingsSection";
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
  marketplace: {
    title: "Browse Loans",
    subtitle: "Every real loan request currently on the loan_registry contract.",
  },
  "my-loans": {
    title: "My Loans",
    subtitle: "Loan requests you've created with the connected wallet.",
  },
  loans: {
    title: "Loan Registry",
    subtitle: "Create loan requests and look up any loan by ID on Stellar Testnet.",
  },
  activity: {
    title: "Activity",
    subtitle: "A live feed of real contract events, for as long as this page stays open.",
  },
  transactions: {
    title: "Transactions",
    subtitle: "Persisted loan_registry event history, recorded by the backend.",
  },
  wallet: {
    title: "Wallet",
    subtitle: "Your Testnet XLM balance and transfers.",
  },
  profile: {
    title: "Profile",
    subtitle: "Your connected wallet and real participation on this contract.",
  },
  settings: {
    title: "Settings",
    subtitle: "Application preferences.",
  },
};

export default function Home() {
  const [activeSection, setActiveSection] = useState<DashboardSection>("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  // FCP-02: when set, a single loan's real-time detail view is shown
  // in place of whichever section is active — `activeSection` still
  // tracks which list the user came from (so the sidebar keeps that
  // item highlighted and "Back" is meaningful), it just isn't what's
  // rendered in the content area while a loan is selected.
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null);

  // Single shared sessions — owned here and passed down as props, so
  // no section creates a second wallet/balance/loan-count instance
  // (preserves the existing L1/L2 architecture).
  const wallet = useWallet();
  const connectedAddress = wallet.status === "connected" ? wallet.address : null;
  const balance = useXlmBalance(connectedAddress);
  const loanCount = useLoanCount();

  function navigate(section: DashboardSection) {
    setActiveSection(section);
    setSelectedLoanId(null);
    setNavOpen(false);
  }

  function viewLoan(loanId: number) {
    setSelectedLoanId(loanId);
  }

  function backFromLoanDetail() {
    setSelectedLoanId(null);
  }

  const viewingLoanDetail = selectedLoanId !== null;
  const meta = viewingLoanDetail
    ? { title: `Loan #${selectedLoanId}`, subtitle: "Real-time details for this loan request." }
    : SECTION_META[activeSection];

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
          {viewingLoanDetail && selectedLoanId !== null && (
            <LoanDetailSection loanId={selectedLoanId} wallet={wallet} onBack={backFromLoanDetail} />
          )}

          {!viewingLoanDetail && activeSection === "dashboard" && (
            <DashboardOverview
              wallet={wallet}
              balance={balance}
              loanCount={loanCount}
              onNavigate={navigate}
            />
          )}

          {!viewingLoanDetail && activeSection === "marketplace" && (
            <BrowseLoansSection onSelectLoan={viewLoan} onNavigate={navigate} />
          )}

          {!viewingLoanDetail && activeSection === "my-loans" && (
            <MyLoansSection wallet={wallet} onSelectLoan={viewLoan} onNavigate={navigate} />
          )}

          {!viewingLoanDetail && activeSection === "loans" && (
            <LoanRegistrySection wallet={wallet} onLoanCountChange={loanCount.refresh} />
          )}

          {!viewingLoanDetail && activeSection === "activity" && <ActivitySection />}

          {!viewingLoanDetail && activeSection === "transactions" && <TransactionsSection />}

          {!viewingLoanDetail && activeSection === "wallet" && (
            <WalletSection wallet={wallet} balance={balance} />
          )}

          {!viewingLoanDetail && activeSection === "profile" && <ProfileSection wallet={wallet} />}

          {!viewingLoanDetail && activeSection === "settings" && <SettingsSection />}
        </div>
      </div>
    </div>
  );
}
