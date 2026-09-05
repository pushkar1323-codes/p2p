/**
 * The dashboard is a single page (no Next.js routes were added for
 * this task — see L2-P07-UI report) with client-side "sections"
 * switched by sidebar navigation.
 *
 * FCP-02 added "Browse Loans" and "My Loans". FCP-03 adds "Activity"
 * (a live SSE-only feed), "Transactions" (the persisted history from
 * the backend's new `GET /events`), "Profile", and "Settings" — every
 * one of these is backed by a real data source (see each section
 * component's own doc comment for exactly which). "Loan Details" (a
 * single loan, reached by clicking a card) is deliberately *not* a
 * nav item — see `page.tsx`'s `selectedLoanId` state.
 */
export type DashboardSection =
  | "dashboard"
  | "loans"
  | "marketplace"
  | "my-loans"
  | "activity"
  | "transactions"
  | "wallet"
  | "profile"
  | "settings";

export interface NavItem {
  id: DashboardSection;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "marketplace", label: "Browse Loans" },
  { id: "my-loans", label: "My Loans" },
  { id: "loans", label: "Loan Registry" },
  { id: "activity", label: "Activity" },
  { id: "transactions", label: "Transactions" },
  { id: "wallet", label: "Wallet" },
  { id: "profile", label: "Profile" },
  { id: "settings", label: "Settings" },
];
