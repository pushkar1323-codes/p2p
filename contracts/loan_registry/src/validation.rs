//! Business-rule validation, extracted out of the entrypoint bodies in
//! `lib.rs` (L3-P06). Each function reproduces exactly one `if` check
//! that used to be written inline in `create_loan_request`/
//! `cancel_loan_request`, returning the same `Error` variant on the
//! same condition — pulled out here so entrypoints read as a sequence
//! of named rules rather than inline conditionals, and so future
//! operations can reuse the same checks (e.g. a future funding
//! operation will likely need its own "is this loan still open"
//! check).

use crate::error::Error;
use crate::types::{LoanRequest, LoanStatus};
use soroban_sdk::Address;

/// `amount` must be strictly positive.
pub fn validate_amount(amount: i128) -> Result<(), Error> {
    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    Ok(())
}

/// `caller` must be `loan`'s original borrower.
pub fn require_owner(loan: &LoanRequest, caller: &Address) -> Result<(), Error> {
    if loan.borrower != *caller {
        return Err(Error::NotLoanOwner);
    }
    Ok(())
}

/// `loan` must currently be `Open`.
pub fn require_open(loan: &LoanRequest) -> Result<(), Error> {
    if loan.status != LoanStatus::Open {
        return Err(Error::LoanNotOpen);
    }
    Ok(())
}
