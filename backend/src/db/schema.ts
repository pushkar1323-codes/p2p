import {
  pgTable,
  bigserial,
  bigint,
  text,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * Infrastructure-only tables. Deliberately no P2P domain tables here
 * (no users/loans/borrowers/lenders/wallets/repayments/profiles/
 * notifications/messages/reputation) — see `06_LEVEL_IMPLEMENTATION_PLAN.md`
 * and this task's own scope. These two tables exist to let a later task
 * record raw on-chain activity (transactions and the contract events they
 * emit) without yet interpreting it into any lending-domain meaning.
 */

/**
 * One row per Stellar/Soroban transaction the backend has observed or
 * submitted on behalf of a caller. Deliberately generic across both
 * plain XLM payments and Soroban contract invocations — a domain layer
 * built later can decide what a given transaction "means" for the P2P
 * product.
 */
export const blockchainTransactions = pgTable(
  "blockchain_transactions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    /** The transaction's hash/hex ID on the ledger. */
    transactionHash: text("transaction_hash").notNull(),

    /** e.g. "testnet", "mainnet" — never hard-coded elsewhere. */
    network: text("network").notNull(),

    /** Lifecycle status, mirroring the frontend's own transaction states. */
    status: text("status", {
      enum: ["pending", "submitted", "confirmed", "failed", "rejected"],
    }).notNull(),

    /**
     * What kind of action this transaction represents, where known
     * (e.g. "xlm_transfer", "contract_invocation"). Nullable: not every
     * caller recording a transaction will always know/need to classify
     * it yet.
     */
    actionType: text("action_type"),

    /** Soroban contract ID this transaction invoked, if any. */
    contractId: text("contract_id"),

    /** When this row was first created. */
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** When the transaction was confirmed on-chain, if it has been. */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),

    /**
     * Safe-to-store failure/error information (a code and/or message),
     * not a raw exception or stack trace. Nullable — most rows won't
     * have failed.
     */
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
  },
  (table) => [
    // A given transaction hash must be recorded at most once.
    uniqueIndex("blockchain_transactions_tx_hash_unique").on(
      table.transactionHash,
    ),
    index("blockchain_transactions_network_idx").on(table.network),
    index("blockchain_transactions_contract_id_idx").on(table.contractId),
  ],
);

/**
 * One row per Soroban contract event ingested from a transaction's
 * result metadata. References `blockchainTransactions` by hash (not a
 * foreign key to its `id`, since an event can be observed and recorded
 * before — or independently of — that transaction's own row existing;
 * a later indexing task can decide how strictly to enforce that
 * relationship).
 */
export const contractEvents = pgTable(
  "contract_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    /** The transaction hash this event was emitted in. */
    transactionHash: text("transaction_hash").notNull(),

    /** The contract that emitted the event. */
    contractId: text("contract_id").notNull(),

    /** e.g. "testnet", "mainnet". */
    network: text("network").notNull(),

    /** e.g. "created", "cancelled" — the event's own topic/name. */
    eventType: text("event_type").notNull(),

    /** Ledger sequence number the event was included in, where known. */
    ledgerSequence: bigint("ledger_sequence", { mode: "number" }),

    /**
     * The event's decoded payload/data as JSON (e.g. `{ loanId, amount }`
     * for a "created" event) — intentionally untyped here; a later
     * indexing task owns interpreting this per event type.
     */
    payload: jsonb("payload"),

    /** When this row was first created. */
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The same event (same transaction, same position/type) must not be
    // ingested twice. There is no per-event index/position field emitted
    // by the contract today, so uniqueness is scoped to
    // (transaction hash, event type) for now — the narrowest constraint
    // that's actually enforceable given what's currently recorded above;
    // a later indexing task adding a proper per-event ordinal can tighten
    // this further if a transaction ever emits the same event type twice.
    uniqueIndex("contract_events_tx_hash_event_type_unique").on(
      table.transactionHash,
      table.eventType,
    ),
    index("contract_events_contract_id_idx").on(table.contractId),
    index("contract_events_network_idx").on(table.network),
  ],
);
