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
//! It deliberately does NOT implement lender funding, interest,
//! repayment, collateral, or any token/asset transfer — those are
//! separate, larger pieces of functionality (see
//! `06_LEVEL_IMPLEMENTATION_PLAN.md`'s Level 3 "P2P Domain
//! Foundation"/"Funding Foundation" tasks) that should be their own
//! reviewed, tested increments, not bundled into this first
//! contract. `types.rs`'s `LoanStatus`/`LoanRequest` are written so
//! that later work can extend them (e.g. adding a `Funded` status)
//! without needing to redesign this contract's storage layout.
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
//!
//! The two L3-P07 admin entrypoints exist only to support the
//! cross-contract call `create_loan_request` now makes — see
//! `eligibility.rs`'s docs for why the dependency itself is
//! deliberately minimal.
//!
//! # Domain state machine (L3-P08)
//!
//! `types.rs`'s `LoanStatus` names the full future P2P lending domain
//! state machine (`Open`, `Cancelled`, `Funded`, `Repaying`,
//! `Repaid`, `Defaulted`), but this contract's entrypoints only ever
//! produce/accept two of those states and one transition:
//!
//! ```text
//! create_loan_request  ──eligible──▶  Open  ──cancel_loan_request──▶  Cancelled
//! ```
//!
//! `validation::require_transition` is the single place that
//! transition table is enforced: `Open -> Cancelled` is the only
//! valid transition; every other pair (including `Cancelled ->
//! Cancelled`, and any transition into `Funded`/`Repaying`/
//! `Repaid`/`Defaulted`, none of which this contract's entrypoints
//! ever attempt) is rejected. Funding, repayment, and default
//! handling — the transitions that would actually reach those four
//! remaining states — are future, separately reviewed increments;
//! see `06_LEVEL_IMPLEMENTATION_PLAN.md`.
//!
//! # Events (L2-P08)
//!
//! Two events are published, one per state-changing operation:
//!
//! | Operation             | Topics                          | Data                |
//! |------------------------|----------------------------------|----------------------|
//! | `create_loan_request`  | `(Symbol("created"), borrower)`  | `(loan_id, amount)`  |
//! | `cancel_loan_request`  | `(Symbol("cancelled"), borrower)`| `loan_id`            |
//!
//! The event name is the first topic (following the common Soroban
//! convention, e.g. token contracts' `transfer`/`mint` events) and
//! the borrower's address is the second topic, so a caller can filter
//! `getEvents` by a specific borrower if useful later. `get_loan_count`
//! and `get_loan_request` are reads and do not emit events — only the
//! two operations that actually change state do.

#![no_std]

mod eligibility;
mod error;
mod events;
mod storage;
#[cfg(test)]
mod test;
mod types;
mod validation;

use soroban_sdk::{contract, contractimpl, Address, Env};

pub use error::Error;
use types::{LoanRequest, LoanStatus};

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
    pub fn cancel_loan_request(env: Env, borrower: Address, loan_id: u64) -> Result<(), Error> {
        borrower.require_auth();

        let mut loan = storage::get_loan(&env, loan_id).ok_or(Error::LoanNotFound)?;

        validation::require_owner(&loan, &borrower)?;
        validation::require_transition(loan.status, LoanStatus::Cancelled)?;

        loan.status = LoanStatus::Cancelled;
        storage::set_loan(&env, loan_id, &loan);

        events::publish_cancelled(&env, borrower, loan_id);

        Ok(())
    }

    /// Returns the stored loan request for `loan_id`.
    pub fn get_loan_request(env: Env, loan_id: u64) -> Result<LoanRequest, Error> {
        storage::get_loan(&env, loan_id).ok_or(Error::LoanNotFound)
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
