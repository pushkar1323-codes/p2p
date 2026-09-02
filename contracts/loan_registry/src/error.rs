//! Contract error codes.
//!
//! Extracted out of `lib.rs` (L3-P06) purely as a module-organization
//! change — the enum, its variants, discriminant values, and doc
//! comments are unchanged from the original. Kept as its own module so
//! future P2P features (funding, repayment, collateral, ...) that
//! need new error variants have an obvious, focused place to add them
//! without touching entrypoint/storage/event code.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `amount` was zero or negative.
    InvalidAmount = 1,
    /// No loan request exists with the given id.
    LoanNotFound = 2,
    /// The caller is not the loan request's original borrower.
    NotLoanOwner = 3,
    /// The loan request is not `Open` (e.g. already cancelled), so
    /// this operation cannot be performed on it.
    LoanNotOpen = 4,
}
