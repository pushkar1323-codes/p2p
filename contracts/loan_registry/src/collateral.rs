//! Collateral locking/release logic (L3-P11).
//!
//! # Scope
//!
//! This is the minimum safe on-chain collateral *locking* primitive:
//! a loan can have `asset + amount + owner + state` recorded against
//! it, and the asset actually moves. Deliberately out of scope, by
//! design, not oversight:
//! - price feeds, oracles, USD valuation, or collateral-to-loan
//!   ratios (a later, separate component would consume this module's
//!   `Collateral` records, not the other way around);
//! - liquidation;
//! - the L3-P10 risk abstraction — it is not consulted here, and
//!   nothing here feeds it either;
//! - a standalone `release_collateral` entrypoint — see "Release"
//!   below for why.
//!
//! # Lifecycle
//!
//! ```text
//! None -> Locked -> Released
//! ```
//!
//! `lock` is the only way into `Locked`. `release_if_locked` is the
//! only way out, and it is called exclusively from
//! `cancel_loan_request` — `Open -> Cancelled` is currently the only
//! loan-lifecycle transition this contract supports that can safely
//! trigger a release. There is no funding or repayment flow yet, so
//! any other "release" trigger would have no real event to attach to;
//! adding a generic, callable-any-time release entrypoint now would
//! also reopen the authorization question (who, besides the borrower
//! getting their own collateral back, could ever be allowed to call
//! it?) before that question has a real answer.
//!
//! # Escrow mechanism
//!
//! Locking transfers `amount` of `token` — any SEP-41-compatible
//! token, via `soroban_sdk::token::Client` — directly from the
//! borrower into this contract's own address
//! (`env.current_contract_address()`). This contract *is* the escrow;
//! there is no separate escrow contract, no allowance/`approve` step,
//! and no internally-tracked balance. The token contract's own
//! `balance()` for this contract's address is the real, independently
//! verifiable source of truth for how much of that asset is currently
//! held; the `Collateral` record here is the source of truth for
//! which loan it belongs to. Releasing reverses the exact transfer.
//!
//! # Atomicity
//!
//! In both `lock` and `release_if_locked`, the token transfer happens
//! before any storage write or event. `token::Client::transfer` (like
//! the rest of the SEP-41 interface) panics on failure — insufficient
//! balance, missing authorization, etc. — rather than returning a
//! `Result`. A panic aborts the entire host invocation, which rolls
//! back every effect from this call, including anything written
//! earlier in the same transaction. So a failed lock or release can
//! never leave a partially-written `Collateral` record, a stale token
//! balance, or an emitted event with no matching state change.

use crate::error::Error;
use crate::events;
use crate::storage;
use crate::types::{Collateral, CollateralStatus, LoanRequest};
use crate::validation;
use soroban_sdk::{token, Address, Env};

/// Locks `amount` of `token` as collateral for `loan_id`, transferring
/// it from `borrower` into this contract. `lib.rs`'s `lock_collateral`
/// entrypoint reads `loan` via `storage::get_loan` (the same as every
/// other entrypoint that needs one) and calls `borrower.require_auth()`
/// before calling this function.
///
/// Validates, in order: `borrower` owns `loan`; `loan` is `Open`;
/// `amount` is positive; and `loan_id` does not already have `Locked`
/// collateral. Only if all four pass does any token move.
pub fn lock(
    env: &Env,
    loan: &LoanRequest,
    loan_id: u64,
    borrower: &Address,
    token_address: &Address,
    amount: i128,
) -> Result<(), Error> {
    validation::require_owner(loan, borrower)?;
    validation::require_loan_open(loan)?;
    validation::validate_amount(amount)?;
    validation::require_not_already_locked(storage::get_collateral(env, loan_id).as_ref())?;

    let token_client = token::Client::new(env, token_address);
    token_client.transfer(borrower, &env.current_contract_address(), &amount);

    let collateral = Collateral {
        loan_id,
        borrower: borrower.clone(),
        token: token_address.clone(),
        amount,
        status: CollateralStatus::Locked,
    };
    storage::set_collateral(env, loan_id, &collateral);

    events::publish_collateral_locked(
        env,
        borrower.clone(),
        loan_id,
        token_address.clone(),
        amount,
    );

    Ok(())
}

/// Releases `loan_id`'s collateral back to its original borrower, if
/// (and only if) a `Locked` record exists for it. A no-op — not an
/// error — if no collateral was ever locked for this loan, or if it
/// was already released; `cancel_loan_request` calls this
/// unconditionally for every cancelled loan, most of which will never
/// have had collateral at all.
///
/// Called exclusively from `cancel_loan_request`, after that
/// function has already verified ownership and performed the
/// `Open -> Cancelled` transition — see this module's docs above for
/// why that is the only supported release trigger.
pub fn release_if_locked(env: &Env, loan_id: u64) {
    let Some(mut collateral) = storage::get_collateral(env, loan_id) else {
        return;
    };
    if collateral.status != CollateralStatus::Locked {
        return;
    }

    let token_client = token::Client::new(env, &collateral.token);
    token_client.transfer(
        &env.current_contract_address(),
        &collateral.borrower,
        &collateral.amount,
    );

    collateral.status = CollateralStatus::Released;
    storage::set_collateral(env, loan_id, &collateral);

    events::publish_collateral_released(
        env,
        collateral.borrower.clone(),
        loan_id,
        collateral.token.clone(),
        collateral.amount,
    );
}
