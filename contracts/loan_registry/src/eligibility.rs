//! The contract-to-contract call `create_loan_request` makes to the
//! configured eligibility dependency contract (L3-P07).
//!
//! `EligibilityContract` below is intentionally just a *shape* — the
//! single function signature this contract needs from whatever
//! address is configured via `set_eligibility_contract`. It does not
//! depend on the `eligibility_registry` crate itself (that crate is
//! only pulled in as a dev-dependency, for tests that exercise a real
//! deployed instance of it — see `test.rs`). This is the point of the
//! `#[contractclient]` pattern: as long as some deployed contract
//! implements a function matching this shape, `loan_registry` can
//! call it, which is exactly what lets a future, larger reputation/
//! risk contract replace `eligibility_registry` later without any
//! change here.

use crate::error::Error;
use soroban_sdk::{contractclient, Address, Env};

#[contractclient(name = "EligibilityClient")]
pub trait EligibilityContract {
    /// Returns whether `borrower` is currently eligible to have a
    /// loan request created on their behalf.
    fn is_borrower_eligible(env: Env, borrower: Address) -> bool;
}

/// Calls `contract_id`'s `is_borrower_eligible(borrower)` and turns a
/// `false` result into a controlled `Error::BorrowerNotEligible` —
/// the one cross-contract call `create_loan_request` makes, before
/// persisting anything (L3-P07). This call is not wrapped in
/// `try_invoke`/similar: an unexpected failure from the dependency
/// (e.g. it isn't a valid contract, or it panics) is intentionally
/// allowed to abort this whole invocation the same way any other
/// unrecoverable failure would, rather than being caught and
/// swallowed.
pub fn require_eligible(env: &Env, contract_id: &Address, borrower: &Address) -> Result<(), Error> {
    let client = EligibilityClient::new(env, contract_id);
    if client.is_borrower_eligible(borrower) {
        Ok(())
    } else {
        Err(Error::BorrowerNotEligible)
    }
}
