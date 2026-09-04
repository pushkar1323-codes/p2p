//! Loan registry — the first Soroban contract for the P2P lending
//! product (L2-P03).
//!
//! # Why this contract
//!
//! The most fundamental on-chain fact a P2P lending protocol needs
//! is a durable, tamper-proof record of "who is asking to borrow how
//! much" — every later concept (lender funding, interest terms,
//! repayment, collateral, reputation, default handling) refers back
//! to a loan request. This contract establishes just that: creating
//! and cancelling loan requests, with borrower-authenticated
//! ownership.
//!
//! It deliberately does NOT implement interest, repayment, or default
//! handling — those are separate, larger pieces of functionality (see
//! `06_LEVEL_IMPLEMENTATION_PLAN.md`'s Level 3/4 tasks) that should be
//! their own reviewed, tested increments, not bundled into this first
//! contract. `types.rs`'s `LoanStatus`/`LoanRequest` are written so
//! that later work can extend them without needing to redesign this
//! contract's storage layout. Collateral *locking* (L3-P11) and
//! single-lender *funding* (L3-P12) are the two exceptions
//! implemented so far — see `collateral.rs`/`funding.rs` and
//! "Collateral"/"Funding" below for why each was safe to add ahead of
//! repayment.
//!
//! # Module layout (L3-P06)
//!
//! This crate root only wires together the public entrypoints below;
//! each responsibility has its own focused module, so future P2P
//! features have an obvious place to extend rather than growing one
//! large file:
//!
//! - [`error`] — the contract's `Error` codes.
//! - [`types`] — domain types stored/returned (`LoanRequest`,
//!   `LoanStatus`).
//! - [`storage`] — storage keys and the get/set helpers entrypoints
//!   use instead of touching `env.storage()` directly.
//! - [`validation`] — the business-rule checks (`amount` positivity,
//!   ownership, admin identity) entrypoints call, plus the loan
//!   domain's centralized state-transition rule,
//!   `require_transition` (L3-P08).
//! - [`events`] — the two event-publishing calls, one per
//!   state-changing operation.
//! - [`eligibility`] — the cross-contract call `create_loan_request`
//!   makes to the configured eligibility dependency contract
//!   (L3-P07).
//! - [`collateral`] — the collateral lock/release logic and real
//!   SEP-41 token transfers `lock_collateral`/`cancel_loan_request`
//!   use (L3-P11).
//! - [`funding`] — the single-lender funding logic and real SEP-41
//!   token transfers `fund_loan` uses (L3-P12).
//!
//! Module organization was purely internal (no behavior change) as of
//! L3-P06; L3-P07 is the first change since then that alters observed
//! behavior — see below.
//!
//! # Public interface
//!
//! - `create_loan_request(borrower, amount) -> u64` — calls the
//!   configured eligibility dependency contract, then (if approved)
//!   creates a new `Open` loan request owned by `borrower`, returns
//!   its id (L3-P07 added the eligibility call; the signature and the
//!   rest of the behavior are unchanged from L2-P03).
//! - `cancel_loan_request(borrower, loan_id)` — cancels an `Open`
//!   loan request; only the original borrower may do this.
//! - `get_loan_request(loan_id) -> LoanRequest` — reads a stored loan
//!   request.
//! - `get_loan_count() -> u64` — total number of loan requests ever
//!   created.
//! - `initialize(admin)` — one-time bootstrap; sets this contract's
//!   admin (L3-P07).
//! - `set_eligibility_contract(admin, contract_id)` — admin-only;
//!   configures which deployed contract `create_loan_request` calls
//!   for the eligibility check (L3-P07).
//! - `lock_collateral(borrower, loan_id, token, amount)` — locks real
//!   SEP-41 `token` collateral for an `Open` loan `borrower` owns
//!   (L3-P11).
//! - `get_collateral(loan_id) -> Collateral` — reads a stored
//!   collateral record (L3-P11).
//! - `fund_loan(lender, loan_id, token, amount)` — funds an `Open`
//!   loan with real SEP-41 `token`, transitioning it to `Funded`
//!   (L3-P12).
//! - `get_funding(loan_id) -> Funding` — reads a stored funding
//!   record (L3-P12).
//!
//! The two L3-P07 admin entrypoints exist only to support the
//! cross-contract call `create_loan_request` now makes — see
//! `eligibility.rs`'s docs for why the dependency itself is
//! deliberately minimal.
//!
//! # Collateral (L3-P11)
//!
//! `lock_collateral` locks a real, transferred token balance — not a
//! stored flag — as collateral for one `Open` loan; the tokens move
//! from the borrower into this contract itself, which acts as the
//! escrow. `cancel_loan_request` now also releases that collateral
//! (if any was locked) back to the borrower as part of cancelling the
//! loan — the only lifecycle point currently safe enough to trigger a
//! release; there is no standalone release entrypoint. Valuation,
//! price feeds, oracles, and liquidation are explicitly out of scope
//! — see `collateral.rs`'s module docs for the full rationale.
//!
//! # Funding (L3-P12)
//!
//! `fund_loan` transfers a real, exact-amount token balance — not a
//! stored flag — from a lender into this contract, which acts as the
//! escrow, and transitions the loan `Open -> Funded`. Exactly one
//! lender may fund a loan, for exactly the requested amount; there is
//! no partial funding and no way to add a second lender. Funding does
//! not require L3-P11 collateral to already be locked, and does not
//! change collateral's own release rule (still only via
//! `cancel_loan_request`, which is no longer reachable once a loan is
//! `Funded`) — see `funding.rs`'s module docs for the full rationale
//! on both points. Interest, repayment, and default handling are
//! explicitly out of scope here too.
//!
//! # Domain state machine (L3-P08)
//!
//! `types.rs`'s `LoanStatus` names the full future P2P lending domain
//! state machine (`Open`, `Cancelled`, `Funded`, `Repaying`,
//! `Repaid`, `Defaulted`), but this contract's entrypoints only ever
//! produce/accept three of those states and two transitions:
//!
//! ```text
//!                                    ┌─cancel_loan_request─▶ Cancelled
//! create_loan_request ──eligible──▶ Open
//!                                    └──────fund_loan──────▶ Funded
//! ```
//!
//! `validation::require_transition` is the single place that
//! transition table is enforced: `Open -> Cancelled` and `Open ->
//! Funded` are the only valid transitions; every other pair
//! (including `Cancelled -> Cancelled`, `Funded -> Funded`, `Funded ->
//! Cancelled`, and any transition into `Repaying`/`Repaid`/
//! `Defaulted`, none of which this contract's entrypoints ever
//! attempt) is rejected. Repayment and default handling — the
//! transitions that would actually reach those three remaining states
//! — are future, separately reviewed increments; see
//! `06_LEVEL_IMPLEMENTATION_PLAN.md`.
//!
//! # Events (L2-P08)
//!
//! Five events are published, one per state-changing operation (plus
//! one conditional):
//!
//! | Operation             | Topics                          | Data                |
//! |------------------------|----------------------------------|----------------------|
//! | `create_loan_request`  | `(Symbol("created"), borrower)`  | `(loan_id, amount)`  |
//! | `cancel_loan_request`  | `(Symbol("cancelled"), borrower)`| `loan_id`            |
//! | `lock_collateral`      | `(Symbol("coll_lock"), borrower)`| `(loan_id, token, amount)` |
//! | `cancel_loan_request` (collateral release, if any was locked) | `(Symbol("coll_rel"), borrower)` | `(loan_id, token, amount)` |
//! | `fund_loan`            | `(Symbol("funded"), lender)`     | `(loan_id, token, amount)` |
//!
//! The event name is the first topic (following the common Soroban
//! convention, e.g. token contracts' `transfer`/`mint` events); the
//! second topic is whichever address actually invoked/authorized that
//! specific operation — the borrower for every loan/collateral event,
//! but the *lender* for `funded` — so a caller can filter `getEvents`
//! by a specific address if useful later. `get_loan_count`,
//! `get_loan_request`, `get_collateral`, and `get_funding` are reads
//! and do not emit events — only state-changing operations do. The
//! `coll_lock`/`coll_rel` symbols are abbreviated to fit
//! `symbol_short!`'s 9-character limit (L3-P11) — see `events.rs`.

#![no_std]

mod collateral;
mod eligibility;
mod error;
mod events;
mod funding;
mod storage;
#[cfg(test)]
mod test;
mod types;
mod validation;

use soroban_sdk::{contract, contractimpl, Address, Env};

pub use error::Error;
use types::{Collateral, Funding, LoanRequest, LoanStatus};

#[contract]
pub struct LoanRegistry;

#[contractimpl]
impl LoanRegistry {
    /// Creates a new `Open` loan request for `borrower`, requesting
    /// `amount`. Requires `borrower`'s authorization — no other
    /// address can create a loan request on someone else's behalf.
    /// Returns the new loan request's id (ids start at 1 and
    /// increment; ids are never reused).
    ///
    /// Emits a `("created", borrower)` event with `(loan_id, amount)`
    /// as data (L2-P08) — see the module-level docs above for the
    /// full event contract.
    pub fn create_loan_request(env: Env, borrower: Address, amount: i128) -> Result<u64, Error> {
        borrower.require_auth();
        validation::validate_amount(amount)?;

        // The one contract-to-contract call this contract makes
        // (L3-P07): the configured eligibility dependency is asked
        // whether `borrower` may open a loan request, *before*
        // anything is persisted. If no dependency is configured, or
        // the dependency rejects the borrower, this returns `Err`
        // here and nothing below runs — no loan id is allocated, no
        // event is published, and the loan count does not change.
        let eligibility_contract = storage::get_eligibility_contract(&env)
            .ok_or(Error::EligibilityContractNotConfigured)?;
        eligibility::require_eligible(&env, &eligibility_contract, &borrower)?;

        let loan_id = storage::next_loan_id(&env);

        // Emitted before the loan is written to storage so that, if
        // storage somehow failed after this point, no event would be
        // observed for a loan that doesn't actually exist — matching
        // the order state changes should be perceived in. `borrower`
        // is cloned here because it is moved into `LoanRequest` right
        // afterward.
        events::publish_created(&env, borrower.clone(), loan_id, amount);

        let loan = LoanRequest {
            borrower,
            amount,
            status: LoanStatus::Open,
        };
        storage::set_loan(&env, loan_id, &loan);

        Ok(loan_id)
    }

    /// Cancels an `Open` loan request. Requires `borrower`'s
    /// authorization, and `borrower` must be the loan request's
    /// original owner (checking both means an attacker cannot cancel
    /// someone else's loan even if they could somehow call this
    /// function, since they cannot produce a valid authorization for
    /// an address that isn't theirs).
    ///
    /// Emits a `("cancelled", borrower)` event with `loan_id` as data
    /// (L2-P08) — see the module-level docs above for the full event
    /// contract.
    ///
    /// If `loan_id` currently has `Locked` collateral, that collateral
    /// is also released back to the borrower as part of this same
    /// call (L3-P11) — see `collateral.rs` for why cancellation is the
    /// only supported release trigger. This is a no-op for the (most
    /// common) case where the loan never had collateral locked.
    pub fn cancel_loan_request(env: Env, borrower: Address, loan_id: u64) -> Result<(), Error> {
        borrower.require_auth();

        let mut loan = storage::get_loan(&env, loan_id).ok_or(Error::LoanNotFound)?;

        validation::require_owner(&loan, &borrower)?;
        validation::require_transition(loan.status, LoanStatus::Cancelled)?;

        loan.status = LoanStatus::Cancelled;
        storage::set_loan(&env, loan_id, &loan);

        events::publish_cancelled(&env, borrower, loan_id);

        collateral::release_if_locked(&env, loan_id);

        Ok(())
    }

    /// Returns the stored loan request for `loan_id`.
    pub fn get_loan_request(env: Env, loan_id: u64) -> Result<LoanRequest, Error> {
        storage::get_loan(&env, loan_id).ok_or(Error::LoanNotFound)
    }

    /// Locks `amount` of `token` as collateral for `loan_id`,
    /// transferring it from `borrower` into this contract (L3-P11).
    /// Requires `borrower`'s authorization, `borrower` must be
    /// `loan_id`'s owner, the loan must currently be `Open`, `amount`
    /// must be positive, and the loan must not already have `Locked`
    /// collateral. See `collateral.rs` for the full mechanism and
    /// atomicity guarantees.
    ///
    /// Emits a `("coll_lock", borrower)` event with `(loan_id, token,
    /// amount)` as data — see the module-level docs above for the
    /// full event contract.
    pub fn lock_collateral(
        env: Env,
        borrower: Address,
        loan_id: u64,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        borrower.require_auth();

        let loan = storage::get_loan(&env, loan_id).ok_or(Error::LoanNotFound)?;

        collateral::lock(&env, &loan, loan_id, &borrower, &token, amount)
    }

    /// Returns the stored collateral record for `loan_id` (L3-P11).
    /// Fails with `Error::CollateralNotFound` if no collateral has
    /// ever been locked for it.
    pub fn get_collateral(env: Env, loan_id: u64) -> Result<Collateral, Error> {
        storage::get_collateral(&env, loan_id).ok_or(Error::CollateralNotFound)
    }

    /// Funds `loan_id` with `amount` of `token`, transferring it from
    /// `lender` into this contract and transitioning the loan `Open
    /// -> Funded` (L3-P12). Requires `lender`'s authorization;
    /// `lender` must not be the loan's own borrower; the loan must
    /// currently be `Open`; and `amount` must be positive and exactly
    /// equal the loan's requested amount. See `funding.rs` for the
    /// full mechanism, atomicity guarantees, and how this interacts
    /// with L3-P11 collateral.
    ///
    /// Emits a `("funded", lender)` event with `(loan_id, token,
    /// amount)` as data — see the module-level docs above for the
    /// full event contract.
    pub fn fund_loan(
        env: Env,
        lender: Address,
        loan_id: u64,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        lender.require_auth();

        let mut loan = storage::get_loan(&env, loan_id).ok_or(Error::LoanNotFound)?;

        funding::fund(&env, &mut loan, loan_id, &lender, &token, amount)
    }

    /// Returns the stored funding record for `loan_id` (L3-P12).
    /// Fails with `Error::FundingNotFound` if the loan has never been
    /// funded.
    pub fn get_funding(env: Env, loan_id: u64) -> Result<Funding, Error> {
        storage::get_funding(&env, loan_id).ok_or(Error::FundingNotFound)
    }

    /// Returns the total number of loan requests ever created
    /// (including cancelled ones).
    pub fn get_loan_count(env: Env) -> u64 {
        storage::loan_count(&env)
    }

    /// One-time bootstrap: sets `admin` as this contract's admin, the
    /// only address later allowed to call `set_eligibility_contract`
    /// (L3-P07). Requires `admin`'s authorization. Fails with
    /// `Error::AlreadyInitialized` if an admin is already configured.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();

        if storage::get_admin(&env).is_some() {
            return Err(Error::AlreadyInitialized);
        }

        storage::set_admin(&env, &admin);
        Ok(())
    }

    /// Configures the eligibility dependency contract
    /// `create_loan_request` calls before persisting a new loan
    /// request (L3-P07). Requires `admin`'s authorization, and
    /// `admin` must be this contract's configured admin
    /// (`Error::NotAdmin` otherwise; `Error::NotInitialized` if
    /// `initialize` was never called).
    pub fn set_eligibility_contract(
        env: Env,
        admin: Address,
        contract_id: Address,
    ) -> Result<(), Error> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        validation::require_admin(&admin, &stored_admin)?;

        storage::set_eligibility_contract(&env, &contract_id);
        Ok(())
    }
}
