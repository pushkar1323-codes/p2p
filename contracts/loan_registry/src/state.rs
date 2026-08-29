//! Persistent state definitions for the loan registry contract.
//!
//! Kept separate from `lib.rs`'s business operations (per L2-P03's
//! modularity requirement) so future P2P lending functionality —
//! funding, repayment, collateral, reputation — can extend or build
//! alongside this state without needing to rewrite it. `LoanStatus`
//! in particular is deliberately left with only the two states this
//! first contract actually manages (`Open`, `Cancelled`); adding
//! states like `Funded`, `Repaid`, or `Defaulted` is left to the
//! lending/funding contract work that builds on this foundation,
//! since that logic (and the token/payment handling it needs) is
//! explicitly out of scope here.

use soroban_sdk::{contracttype, Address};

/// A borrower's request for a loan. Intentionally minimal: no
/// lender, funding, interest, or repayment state yet — this is the
/// first on-chain primitive the future P2P lending/funding contract
/// work will build on.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LoanRequest {
    /// The address that created (and is the only address that may
    /// cancel) this loan request.
    pub borrower: Address,
    /// Requested loan amount, in the smallest unit of whatever asset
    /// a future funding contract will use. Deliberately asset-
    /// agnostic here: no token/asset identifier is stored, since
    /// wiring up an actual funding/payment flow is out of scope for
    /// this first contract.
    pub amount: i128,
    pub status: LoanStatus,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LoanStatus {
    /// Awaiting funding. The only status a newly created loan
    /// request can have.
    Open,
    /// Withdrawn by the borrower before being funded.
    Cancelled,
}

/// Storage keys for this contract's persistent state.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Instance-storage counter: the number of loan requests ever
    /// created, and the source of the next loan request's id.
    LoanCount,
    /// Persistent-storage entry for one loan request, keyed by id.
    Loan(u64),
}
