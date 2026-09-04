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
    /// `initialize` was called on a contract that already has an
    /// admin configured (L3-P07).
    AlreadyInitialized = 5,
    /// An admin-only operation (e.g. `set_eligibility_contract`) was
    /// attempted before `initialize` was ever called (L3-P07).
    NotInitialized = 6,
    /// The caller is not this contract's configured admin (L3-P07).
    NotAdmin = 7,
    /// `create_loan_request` was called before an eligibility
    /// dependency contract was configured via
    /// `set_eligibility_contract` (L3-P07).
    EligibilityContractNotConfigured = 8,
    /// The configured eligibility dependency contract rejected the
    /// borrower — they are not currently eligible to open a loan
    /// request (L3-P07).
    BorrowerNotEligible = 9,
    /// `lock_collateral` was called for a loan that already has a
    /// `Locked` collateral record (L3-P11). Prevents double-locking.
    CollateralAlreadyLocked = 10,
    /// `get_collateral` was called for a loan that has never had
    /// collateral locked against it (L3-P11).
    CollateralNotFound = 11,
    /// `fund_loan` was called by the loan's own borrower — a lender
    /// funding their own loan request is not a meaningful funding
    /// event (L3-P12).
    LenderIsBorrower = 12,
    /// `fund_loan`'s `amount` did not exactly equal the loan's
    /// requested `amount` (L3-P12). Distinct from `InvalidAmount`,
    /// which only checks that `amount` is positive — this checks it
    /// against the specific loan being funded. Partial funding is not
    /// supported.
    FundingAmountMismatch = 13,
    /// `get_funding` was called for a loan that has never been funded
    /// (L3-P12).
    FundingNotFound = 14,
}
