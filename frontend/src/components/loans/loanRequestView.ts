import type { ContractReadStatus } from "../../hooks/contractReadState";

export type LoanRequestView = "connect" | "loading" | "error" | "register" | "form";

/**
 * Which of `LoanRequestActions`' five mutually-exclusive views to
 * show, given the connected wallet's state and its eligibility read.
 * Extracted as a pure function (mirrors `canFundLoan` in
 * `loanRegistryErrors.ts`) specifically so this decision is directly
 * unit-testable without rendering the component — this project has no
 * React Testing Library/jsdom, so a rendered-output test isn't an
 * option here; a pure function that returns which branch would render
 * is.
 *
 * `"register"` deliberately covers BOTH an unregistered wallet and a
 * blocked one: `is_borrower_eligible` is deny-by-default on-chain and
 * returns `false` for both cases identically (see
 * `eligibility_registry`'s own doc comment) — this frontend has no
 * separate on-chain read to distinguish them in advance, so there is
 * no third view to add here. A blocked wallet finds out specifically
 * *why* only once it attempts to register (see
 * `RegisterWalletAction`'s `BLOCKED_MESSAGE` handling) — that's a
 * different, already-tested concern from this view decision.
 *
 * `eligibilityStatus === "idle"` is grouped with `"loading"` (not
 * given its own branch): `"idle"` only occurs before the initial
 * fetch's effect has run, which for a connected wallet is a single
 * render tick — indistinguishable from "loading" to a user, and
 * `LoanRequestActions`' existing JSX already merged these before this
 * extraction.
 */
export function resolveLoanRequestView(
  connected: boolean,
  eligibilityStatus: ContractReadStatus,
  eligibilityData: boolean | null
): LoanRequestView {
  if (!connected) return "connect";
  if (eligibilityStatus === "idle" || eligibilityStatus === "loading") return "loading";
  if (eligibilityStatus === "error") return "error";
  if (eligibilityData === false) return "register";
  return "form";
}
