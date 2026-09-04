//! Lender funding logic (L3-P12).
//!
//! # Scope
//!
//! This is the first real lender → loan funding primitive: a single
//! lender transfers exactly the requested amount, once, into this
//! contract, and the loan transitions `Open -> Funded`. Deliberately
//! out of scope, by design, not oversight:
//! - partial funding — `amount` must exactly equal the loan's
//!   requested amount, checked before any transfer;
//! - multiple lenders — one `Funding` record per loan, never
//!   overwritten;
//! - lender matching, order books, or any marketplace logic;
//! - liquidation, repayment, interest calculation, and late/default
//!   handling — all future, separately reviewed increments (see
//!   `06_LEVEL_IMPLEMENTATION_PLAN.md`);
//! - oracle integration or risk-based funding decisions — the L3-P10
//!   risk abstraction is not consulted here, and nothing here feeds
//!   it either, the same boundary `collateral.rs` already draws for
//!   itself.
//!
//! # Interaction with collateral (L3-P11)
//!
//! Funding does **not** require collateral to already be locked, and
//! this module adds no new collateral lifecycle state to enforce
//! that. This is a deliberate limitation, not an oversight, and it
//! falls directly out of the existing rules rather than requiring any
//! new ones:
//! - `collateral::lock` only succeeds while a loan is `Open`
//!   (`validation::require_loan_open`).
//! - `fund` below transitions the loan `Open -> Funded` via the same
//!   shared `validation::require_transition`.
//! - Once `Funded`, `require_loan_open` — and therefore
//!   `collateral::lock` — can never succeed again for that loan.
//!
//! So collateral, if a lender wants it, must already be locked
//! *before* `fund_loan` is called; there is currently no code path
//! that enforces this as a precondition of funding, and no code path
//! that lets collateral be locked afterward either. A `Funded` loan
//! with no `Collateral` record (or one that was never `Locked`) is
//! valid and fundable as this task is scoped — uncollateralized
//! lending is implicitly possible at this stage. Whether funding
//! should someday require locked collateral first is a real product
//! question, but answering it would mean adding a new precondition
//! check (and probably a way to query it up front), which is exactly
//! the kind of new lifecycle rule this task was told not to invent.
//!
//! Symmetrically, this module does not change `collateral.rs` at all:
//! `cancel_loan_request` (and the collateral release it triggers) is
//! only reachable while a loan is `Open`
//! (`validation::require_transition`), so once a loan is `Funded`,
//! any collateral already locked for it stays locked — there is no
//! release path once funding happens. That is an accurate, existing
//! consequence of L3-P11's own scope (release only via cancellation),
//! not something introduced or worked around here.
//!
//! # Escrow mechanism
//!
//! Exactly like `collateral::lock`: the funding transfers `amount` of
//! `token` — any SEP-41-compatible token, via
//! `soroban_sdk::token::Client` — directly from the lender into this
//! contract's own address (`env.current_contract_address()`). This
//! contract is its own escrow for funding principal, the same as it
//! is for collateral; the two use separate storage records
//! (`Funding` vs. `Collateral`) and separate `DataKey` slots, so
//! nothing about one is inferable from, or overwrites, the other.
//!
//! # Atomicity
//!
//! The token transfer happens before any storage write or event,
//! exactly following `collateral::lock`'s pattern. `token::Client::
//! transfer` panics (rather than returning a `Result`) on failure —
//! insufficient balance, missing authorization, etc. — which aborts
//! the entire host invocation and rolls back every effect from this
//! call, including the loan's status. So a failed `fund_loan` call
//! can never leave the loan half-transitioned, a `Funding` record
//! written without a matching transfer, or a stale token balance.

use crate::error::Error;
use crate::events;
use crate::storage;
use crate::types::{Funding, LoanRequest, LoanStatus};
use crate::validation;
use soroban_sdk::{token, Address, Env};

/// Funds `loan_id` with `amount` of `token`, transferring it from
/// `lender` into this contract and transitioning the loan `Open ->
/// Funded`. `lib.rs`'s `fund_loan` entrypoint reads `loan` via
/// `storage::get_loan` (the same as every other entrypoint that needs
/// one) and calls `lender.require_auth()` before calling this
/// function.
///
/// Validates, in order: `lender` is not `loan`'s own borrower; the
/// loan is currently `Open` (so this also rejects funding an already-
/// funded or already-cancelled loan, both via `Error::LoanNotOpen` —
/// see `validation::require_transition`); `amount` is positive; and
/// `amount` exactly equals `loan.amount`. Only if all four pass does
/// any token move.
pub fn fund(
    env: &Env,
    loan: &mut LoanRequest,
    loan_id: u64,
    lender: &Address,
    token_address: &Address,
    amount: i128,
) -> Result<(), Error> {
    validation::require_lender_is_not_borrower(loan, lender)?;
    validation::require_transition(loan.status, LoanStatus::Funded)?;
    validation::validate_amount(amount)?;
    validation::require_exact_funding_amount(amount, loan.amount)?;

    let token_client = token::Client::new(env, token_address);
    token_client.transfer(lender, &env.current_contract_address(), &amount);

    loan.status = LoanStatus::Funded;
    storage::set_loan(env, loan_id, loan);

    let funding = Funding {
        loan_id,
        lender: lender.clone(),
        token: token_address.clone(),
        amount,
    };
    storage::set_funding(env, loan_id, &funding);

    events::publish_funded(env, lender.clone(), loan_id, token_address.clone(), amount);

    Ok(())
}
