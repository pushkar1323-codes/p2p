//! Domain types stored/returned by this contract.
//!
//! Split out of the former `state.rs` (L3-P06) into just the domain
//! shapes — storage keys and access now live in `storage.rs` instead.
//! `LoanRequest`/`LoanStatus` themselves, their fields, and their
//! `#[contracttype]` derives are unchanged from the original, so the
//! stored/returned representation is byte-for-byte compatible.
//!
//! `LoanStatus` deliberately still has only the two states this
//! contract manages (`Open`, `Cancelled`); adding states like
//! `Funded`, `Repaid`, or `Defaulted` is left to future funding/
//! lending contract work, which is out of scope for this refactor
//! (see `00_MASTER_RULES.md` §18 / this task's own restrictions).

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
    /// this contract.
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
