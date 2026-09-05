import { eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import { blockchainTransactions } from "../db/schema.ts";
import { AppError } from "../errors/AppError.ts";

/**
 * Raw, not-yet-trusted description of a single blockchain transaction a
 * caller wants recorded — the `blockchain_transactions` sibling of
 * `eventProcessing.ts`'s `RawContractEventInput`. Same "everything is
 * `unknown`, validated before anything is trusted" boundary.
 */
export interface RawBlockchainTransactionInput {
  transactionHash?: unknown;
  network?: unknown;
  status?: unknown;
  /** Optional — normalized to `null` when omitted. */
  actionType?: unknown;
  /** Optional — normalized to `null` when omitted. */
  contractId?: unknown;
  /** Optional ISO date string — normalized to a `Date` or `null`. */
  confirmedAt?: unknown;
  /** Optional — normalized to `null` when omitted. */
  errorCode?: unknown;
  /** Optional — normalized to `null` when omitted. */
  errorMessage?: unknown;
}

export type BlockchainTransactionStatus =
  | "pending"
  | "submitted"
  | "confirmed"
  | "failed"
  | "rejected";

const VALID_STATUSES: readonly BlockchainTransactionStatus[] = [
  "pending",
  "submitted",
  "confirmed",
  "failed",
  "rejected",
];

export interface NormalizedBlockchainTransaction {
  transactionHash: string;
  network: string;
  status: BlockchainTransactionStatus;
  actionType: string | null;
  contractId: string | null;
  confirmedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export type RecordBlockchainTransactionResult =
  | { outcome: "inserted"; transaction: NormalizedBlockchainTransaction }
  | { outcome: "duplicate"; transaction: NormalizedBlockchainTransaction };

interface FieldIssue {
  field: string;
  message: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Validates an optional string field, pushing an issue only if it's present-but-invalid. `undefined`/`null` normalize to `null`. */
function normalizeOptionalString(
  value: unknown,
  field: string,
  issues: FieldIssue[],
): string | null {
  if (value === undefined || value === null) return null;
  if (!isNonEmptyString(value)) {
    issues.push({ field, message: "must be a non-empty string when provided" });
    return null;
  }
  return value.trim();
}

/**
 * Validates and normalizes a raw transaction input into a
 * `NormalizedBlockchainTransaction`. Never touches the database.
 * Throws `AppError.validationFailed` (422) listing every problem
 * found — same convention as `eventProcessing.ts`'s
 * `validateAndNormalizeEvent`.
 */
export function validateAndNormalizeTransaction(
  input: RawBlockchainTransactionInput,
): NormalizedBlockchainTransaction {
  const issues: FieldIssue[] = [];

  if (!isNonEmptyString(input.transactionHash)) {
    issues.push({ field: "transactionHash", message: "is required and must be a non-empty string" });
  }
  if (!isNonEmptyString(input.network)) {
    issues.push({ field: "network", message: "is required and must be a non-empty string" });
  }
  if (
    !isNonEmptyString(input.status) ||
    !VALID_STATUSES.includes(input.status as BlockchainTransactionStatus)
  ) {
    issues.push({ field: "status", message: `must be one of: ${VALID_STATUSES.join(", ")}` });
  }

  const actionType = normalizeOptionalString(input.actionType, "actionType", issues);
  const contractId = normalizeOptionalString(input.contractId, "contractId", issues);
  const errorCode = normalizeOptionalString(input.errorCode, "errorCode", issues);
  const errorMessage = normalizeOptionalString(input.errorMessage, "errorMessage", issues);

  let confirmedAt: Date | null = null;
  if (input.confirmedAt !== undefined && input.confirmedAt !== null) {
    const parsed = typeof input.confirmedAt === "string" ? new Date(input.confirmedAt) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      issues.push({ field: "confirmedAt", message: "must be a valid ISO date string when provided" });
    } else {
      confirmedAt = parsed;
    }
  }

  if (issues.length > 0) {
    throw AppError.validationFailed("Blockchain transaction input failed validation.", issues);
  }

  return {
    transactionHash: (input.transactionHash as string).trim(),
    network: (input.network as string).trim(),
    status: input.status as BlockchainTransactionStatus,
    actionType,
    contractId,
    confirmedAt,
    errorCode,
    errorMessage,
  };
}

/**
 * Validates, normalizes, and persists a single transaction into
 * `blockchain_transactions`, idempotently — the same
 * `ON CONFLICT DO NOTHING` + read-back-on-conflict shape as
 * `processContractEvent`, keyed on the table's own unique
 * `transactionHash` constraint. No real-time broadcast here (unlike
 * contract events): a raw transaction record isn't itself something
 * the frontend's SSE-driven UI reacts to — only the contract events
 * it emits are.
 */
export async function recordBlockchainTransaction(
  input: RawBlockchainTransactionInput,
  db?: Database,
): Promise<RecordBlockchainTransactionResult> {
  const normalized = validateAndNormalizeTransaction(input);
  const database = db ?? getDb().db;

  let insertedRows: (typeof blockchainTransactions.$inferSelect)[];
  try {
    insertedRows = await database
      .insert(blockchainTransactions)
      .values(normalized)
      .onConflictDoNothing({ target: blockchainTransactions.transactionHash })
      .returning();
  } catch (err) {
    console.error("Blockchain transaction persistence failed:", err);
    throw AppError.persistenceFailed(
      "Failed to persist blockchain transaction.",
      { transactionHash: normalized.transactionHash },
      { cause: err },
    );
  }

  if (insertedRows.length > 0) {
    return { outcome: "inserted", transaction: normalized };
  }

  let existingRows: (typeof blockchainTransactions.$inferSelect)[];
  try {
    existingRows = await database
      .select()
      .from(blockchainTransactions)
      .where(eq(blockchainTransactions.transactionHash, normalized.transactionHash))
      .limit(1);
  } catch (err) {
    console.error("Failed to look up existing blockchain transaction after conflict:", err);
    throw AppError.persistenceFailed(
      "Failed to read back the already-persisted blockchain transaction.",
      { transactionHash: normalized.transactionHash },
      { cause: err },
    );
  }

  const existing = existingRows[0];
  return {
    outcome: "duplicate",
    transaction: existing
      ? {
          transactionHash: existing.transactionHash,
          network: existing.network,
          status: existing.status as BlockchainTransactionStatus,
          actionType: existing.actionType,
          contractId: existing.contractId,
          confirmedAt: existing.confirmedAt,
          errorCode: existing.errorCode,
          errorMessage: existing.errorMessage,
        }
      : normalized,
  };
}
