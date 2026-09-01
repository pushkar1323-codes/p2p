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
//! contract. `state.rs`'s `LoanStatus`/`LoanRequest` are written so
//! that later work can extend them (e.g. adding a `Funded` status)
//! without needing to redesign this contract's storage layout.
//!
//! # Public interface
//!
//! - `create_loan_request(borrower, amount) -> u64` — creates a new
//!   `Open` loan request owned by `borrower`, returns its id.
//! - `cancel_loan_request(borrower, loan_id)` — cancels an `Open`
//!   loan request; only the original borrower may do this.
//! - `get_loan_request(loan_id) -> LoanRequest` — reads a stored loan
//!   request.
//! - `get_loan_count() -> u64` — total number of loan requests ever
//!   created.
//!
//! All four are intentionally small and explicit, per L2-P03's scope
//! — no admin/config functions, no batch operations, nothing added
//! "because it might be useful later."
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

mod state;
#[cfg(test)]
mod test;

use soroban_sdk::{contract, contracterror, contractimpl, symbol_short, Address, Env};
use state::{DataKey, LoanRequest, LoanStatus};

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
    /// as data (L2-P08) — see the module-level docs below for the
    /// full event contract.
    pub fn create_loan_request(env: Env, borrower: Address, amount: i128) -> Result<u64, Error> {
        borrower.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let loan_id = Self::next_loan_id(&env);

        // Emitted before the loan is written to storage so that, if
        // storage somehow failed after this point, no event would be
        // observed for a loan that doesn't actually exist — matching
        // the order state changes should be perceived in. `borrower`
        // is cloned here because it is moved into `LoanRequest` right
        // afterward.
        env.events().publish(
            (symbol_short!("created"), borrower.clone()),
            (loan_id, amount),
        );

        let loan = LoanRequest {
            borrower,
            amount,
            status: LoanStatus::Open,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Loan(loan_id), &loan);

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
    /// (L2-P08) — see the module-level docs below for the full event
    /// contract.
    pub fn cancel_loan_request(env: Env, borrower: Address, loan_id: u64) -> Result<(), Error> {
        borrower.require_auth();

        let key = DataKey::Loan(loan_id);
        let mut loan: LoanRequest = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::LoanNotFound)?;

        if loan.borrower != borrower {
            return Err(Error::NotLoanOwner);
        }
        if loan.status != LoanStatus::Open {
            return Err(Error::LoanNotOpen);
        }

        loan.status = LoanStatus::Cancelled;
        env.storage().persistent().set(&key, &loan);

        env.events()
            .publish((symbol_short!("cancelled"), borrower), loan_id);

        Ok(())
    }

    /// Returns the stored loan request for `loan_id`.
    pub fn get_loan_request(env: Env, loan_id: u64) -> Result<LoanRequest, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Loan(loan_id))
            .ok_or(Error::LoanNotFound)
    }

    /// Returns the total number of loan requests ever created
    /// (including cancelled ones).
    pub fn get_loan_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::LoanCount)
            .unwrap_or(0)
    }

    /// Allocates and persists the next sequential loan id.
    fn next_loan_id(env: &Env) -> u64 {
        let next: u64 = env
            .storage()
            .instance()
            .get(&DataKey::LoanCount)
            .unwrap_or(0)
            + 1;
        env.storage().instance().set(&DataKey::LoanCount, &next);
        next
    }
}
