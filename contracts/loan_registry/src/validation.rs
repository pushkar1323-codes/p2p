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
/// status transitions are currently valid (L3-P08; `Open -> Funded`
/// added L3-P12).
///
/// `Open -> Cancelled` and `Open -> Funded` are the only valid
/// transitions; everything else — including `Cancelled -> Cancelled`,
/// `Funded -> Funded` (i.e. funding an already-funded loan a second
/// time), and any transition into `Repaying`, `Repaid`, or `Defaulted`
/// (none of which any entrypoint in this contract currently attempts)
/// — is rejected with `Error::LoanNotOpen`. Reusing the same error for
/// "already funded" as for "already cancelled" follows this module's
/// existing philosophy (see `require_loan_open`'s docs below): both
/// are, from the caller's point of view, exactly the same underlying
/// condition — the loan is no longer `Open` — so a dedicated
/// `AlreadyFunded` variant would only duplicate that meaning.
/// Centralizing the rule here, rather than comparing `loan.status`
/// inline at each call site, gives future domain increments
/// (repayment, default handling) one place to extend the transition
/// table.
pub fn require_transition(current: LoanStatus, target: LoanStatus) -> Result<(), Error> {
    match (current, target) {
        (LoanStatus::Open, LoanStatus::Cancelled) => Ok(()),
        (LoanStatus::Open, LoanStatus::Funded) => Ok(()),
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

/// `lender` must not be `loan`'s own borrower (L3-P12) — a borrower
/// funding their own loan request is not a meaningful funding event
/// and is rejected before any other funding check runs.
pub fn require_lender_is_not_borrower(loan: &LoanRequest, lender: &Address) -> Result<(), Error> {
    if loan.borrower == *lender {
        return Err(Error::LenderIsBorrower);
    }
    Ok(())
}

/// `amount` must exactly equal `loan_amount` (L3-P12). Partial
/// funding is not supported, so this is a strict equality check, not
/// a minimum/maximum. Distinct from `validate_amount`, which only
/// checks positivity and applies to any amount-bearing operation in
/// this contract, not specifically to matching one loan's requested
/// amount.
pub fn require_exact_funding_amount(amount: i128, loan_amount: i128) -> Result<(), Error> {
    if amount != loan_amount {
        return Err(Error::FundingAmountMismatch);
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
    fn open_to_funded_is_a_valid_transition() {
        assert_eq!(
            require_transition(LoanStatus::Open, LoanStatus::Funded),
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
    fn no_transition_into_a_still_unreachable_status_is_valid() {
        for target in [
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

    #[test]
    fn funded_cannot_transition_anywhere() {
        // In particular: funding an already-funded loan a second time
        // is rejected, and a `Funded` loan cannot be cancelled — once
        // funded, `cancel_loan_request` (and therefore its collateral
        // release) is no longer reachable (L3-P12).
        for target in [
            LoanStatus::Open,
            LoanStatus::Cancelled,
            LoanStatus::Funded,
            LoanStatus::Repaying,
            LoanStatus::Repaid,
            LoanStatus::Defaulted,
        ] {
            assert_eq!(
                require_transition(LoanStatus::Funded, target),
                Err(Error::LoanNotOpen)
            );
        }
    }
}
