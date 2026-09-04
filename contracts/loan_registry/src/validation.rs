//! Business-rule validation, extracted out of the entrypoint bodies in
//! `lib.rs` (L3-P06). Most functions here reproduce exactly one `if`
//! check that used to be written inline in `create_loan_request`/
//! `cancel_loan_request`, returning the same `Error` variant on the
//! same condition — pulled out here so entrypoints read as a sequence
//! of named rules rather than inline conditionals, and so future
//! operations can reuse the same checks. `require_transition`
//! (L3-P08) is this module's explicit, centralized statement of the
//! loan domain's state machine — see its own docs below.

use crate::error::Error;
use crate::types::{Collateral, CollateralStatus, LoanRequest, LoanStatus};
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

/// The loan domain state machine's single source of truth for which
/// status transitions are currently valid (L3-P08).
///
/// Only `Open -> Cancelled` is valid; everything else — including
/// `Cancelled -> Cancelled` and any transition into `Funded`,
/// `Repaying`, `Repaid`, or `Defaulted` (none of which any entrypoint
/// in this contract currently attempts) — is rejected with the same
/// `Error::LoanNotOpen` `cancel_loan_request` already returned for an
/// already-cancelled loan before this task, so this is a stricter
/// internal statement of the same rule, not an observable behavior
/// change. Centralizing the rule here, rather than comparing
/// `loan.status` inline at each call site (as the pre-L3-P08
/// `require_open` used to), gives future domain increments (funding,
/// repayment, default handling) one place to extend the transition
/// table.
pub fn require_transition(current: LoanStatus, target: LoanStatus) -> Result<(), Error> {
    match (current, target) {
        (LoanStatus::Open, LoanStatus::Cancelled) => Ok(()),
        _ => Err(Error::LoanNotOpen),
    }
}

/// `caller` must be this contract's configured admin (L3-P07).
pub fn require_admin(caller: &Address, stored_admin: &Address) -> Result<(), Error> {
    if caller != stored_admin {
        return Err(Error::NotAdmin);
    }
    Ok(())
}

/// `loan` must currently be `Open` (L3-P11). Used by
/// `collateral::lock`, which does not itself transition the loan's
/// status — only `cancel_loan_request` does that, via
/// `require_transition` above. Reuses `Error::LoanNotOpen`: from the
/// caller's point of view "this loan isn't open" is the same
/// condition either way, so a separate error variant would only
/// duplicate meaning.
pub fn require_loan_open(loan: &LoanRequest) -> Result<(), Error> {
    if loan.status != LoanStatus::Open {
        return Err(Error::LoanNotOpen);
    }
    Ok(())
}

/// Rejects locking new collateral for a loan that already has a
/// `Locked` collateral record (L3-P11) — prevents double-locking.
/// `existing` is whatever `storage::get_collateral` currently returns
/// for the loan: `None` (nothing ever locked) and `Some` with status
/// `Released` are both fine to lock over; only `Locked` is rejected.
pub fn require_not_already_locked(existing: Option<&Collateral>) -> Result<(), Error> {
    if let Some(collateral) = existing {
        if collateral.status == CollateralStatus::Locked {
            return Err(Error::CollateralAlreadyLocked);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    //! Direct unit tests for the pure `require_transition` state-
    //! machine rule (L3-P08). These need no `Env`/contract
    //! registration — `LoanStatus`/`Error` are plain values — so the
    //! full transition table can be asserted here directly, alongside
    //! (not instead of) `test.rs`'s contract-level
    //! `cancel_loan_request` behavior tests.

    use super::*;

    #[test]
    fn open_to_cancelled_is_a_valid_transition() {
        assert_eq!(
            require_transition(LoanStatus::Open, LoanStatus::Cancelled),
            Ok(())
        );
    }

    #[test]
    fn cancelled_to_cancelled_is_not_a_valid_transition() {
        assert_eq!(
            require_transition(LoanStatus::Cancelled, LoanStatus::Cancelled),
            Err(Error::LoanNotOpen)
        );
    }

    #[test]
    fn no_transition_into_an_inactive_status_is_valid() {
        for target in [
            LoanStatus::Funded,
            LoanStatus::Repaying,
            LoanStatus::Repaid,
            LoanStatus::Defaulted,
        ] {
            assert_eq!(
                require_transition(LoanStatus::Open, target),
                Err(Error::LoanNotOpen)
            );
        }
    }

    #[test]
    fn cancelled_cannot_transition_anywhere() {
        for target in [
            LoanStatus::Open,
            LoanStatus::Funded,
            LoanStatus::Repaying,
            LoanStatus::Repaid,
            LoanStatus::Defaulted,
        ] {
            assert_eq!(
                require_transition(LoanStatus::Cancelled, target),
                Err(Error::LoanNotOpen)
            );
        }
    }
}
