/**
 * Pure types and logic for `loan_registry` contract reads (L2-P05),
 * kept dependency-free (no imports at all) so this module — unlike
 * `loanRegistry.ts`, which imports the live `@stellar/stellar-sdk`
 * and this project's `@/config/stellar` alias — can be loaded
 * directly by Node's test runner without a bundler. Same reasoning
 * as `signError.ts`'s split from `transaction.ts`.
 *
 * Re-exported from `loanRegistry.ts` for a single public import
 * surface for consumers.
 */

export type LoanStatus = "Open" | "Cancelled";

export interface LoanRequest {
  loanId: number;
  borrower: string;
  amount: bigint;
  status: LoanStatus;
}

export type LoanRegistryErrorCode = "LOAN_NOT_FOUND" | "NETWORK_ERROR" | "UNKNOWN";

export interface LoanRegistryError {
  code: LoanRegistryErrorCode;
  message: string;
}

/**
 * `contracttype` unit-variant enums (like `LoanStatus`) are decoded
 * by the SDK based on the contract's real on-chain spec; the exact JS
 * shape it lands on has a couple of documented conventions depending
 * on SDK/binding version (a plain string, or a `{ tag, values }`
 * union used by `stellar contract bindings typescript`-generated
 * clients). Handled defensively here rather than assuming one shape,
 * since this could not be verified against the live deployed
 * contract from the environment this was written in (see the L2-P05
 * report's limitations section) — recommend a real smoke-test read
 * to confirm, and simplifying this function if only one shape ever
 * appears in practice.
 */
export function parseLoanStatus(raw: unknown): LoanStatus {
  if (raw === "Open" || raw === "Cancelled") {
    return raw;
  }
  if (typeof raw === "object" && raw !== null && "tag" in raw) {
    const tag = (raw as { tag: unknown }).tag;
    if (tag === "Open" || tag === "Cancelled") return tag;
  }
  if (Array.isArray(raw) && (raw[0] === "Open" || raw[0] === "Cancelled")) {
    return raw[0];
  }
  throw new Error(`Unrecognized LoanStatus value: ${JSON.stringify(raw)}`);
}

/**
 * Maps a failure from the RPC/simulation layer to a safe,
 * generic-but-informative LoanRegistryError. Never exposes raw
 * RPC/SDK error text to the UI, consistent with this project's
 * existing error-handling convention (appError.ts, kitMapping.ts).
 */
export function classifyReadError(err: unknown): LoanRegistryError {
  const message = err instanceof Error ? err.message : String(err);

  if (/network|fetch failed|ECONNREFUSED|ENOTFOUND|timeout|abort/i.test(message)) {
    return {
      code: "NETWORK_ERROR",
      message: "Could not reach the Stellar network. Check your connection and try again.",
    };
  }

  return {
    code: "UNKNOWN",
    message: "Something went wrong reading contract data. Please try again.",
  };
}

export function isLoanRegistryError(err: unknown): err is LoanRegistryError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    ["LOAN_NOT_FOUND", "NETWORK_ERROR", "UNKNOWN"].includes(
      (err as { code: unknown }).code as string
    )
  );
}
