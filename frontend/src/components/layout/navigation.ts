/**
 * The dashboard is a single page (no Next.js routes were added for
 * this task — see L2-P07-UI report) with client-side "sections"
 * switched by sidebar navigation.
 *
 * FCP-02 adds "Browse Loans" and "My Loans" — both backed by the
 * same real client-side scan of `loan_registry` (see
 * `hooks/useLoanRegistryList.ts`), same standard as the original
 * three sections. "Loan Details" (a single loan, reached by clicking
 * a card in either list) is deliberately *not* a nav item — it's a
 * drill-down view, not a standalone destination — see `page.tsx`'s
 * `selectedLoanId` state.
 */
export type DashboardSection = "dashboard" | "loans" | "marketplace" | "my-loans" | "wallet";

export interface NavItem {
  id: DashboardSection;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "marketplace", label: "Browse Loans" },
  { id: "my-loans", label: "My Loans" },
  { id: "loans", label: "Loan Registry" },
  { id: "wallet", label: "Wallet" },
];
