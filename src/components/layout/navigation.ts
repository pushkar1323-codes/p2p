/**
 * The dashboard is a single page (no Next.js routes were added for
 * this task — see L2-P07-UI report) with client-side "sections"
 * switched by sidebar navigation. Kept to exactly the three areas
 * backed by real functionality: dashboard overview, the loan
 * registry contract UI, and the wallet (balance + transfer).
 */
export type DashboardSection = "dashboard" | "loans" | "wallet";

export interface NavItem {
  id: DashboardSection;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "loans", label: "Loan Registry" },
  { id: "wallet", label: "Wallet" },
];
