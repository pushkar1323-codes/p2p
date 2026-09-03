//! Eligibility registry — a deliberately minimal dependency contract
//! (L3-P07).
//!
//! # Why this contract exists
//!
//! `loan_registry`'s `create_loan_request` needs to check, on-chain,
//! whether a borrower is currently allowed to open a loan request
//! before persisting one. The real version of that check will
//! eventually be a much larger reputation/risk-scoring contract (see
//! `02_PROJECT_BRAIN.md`'s "borrower reputation"/"risk assessment"
//! feature list). Building that here would be scope creep for this
//! task — L3-P07's actual goal is to establish and prove the
//! contract-to-contract *pattern* `loan_registry` will use, with a
//! dependency small enough that a future real reputation/risk
//! contract can be swapped in later without redesigning
//! `loan_registry` (only `loan_registry`'s `EligibilityContract`
//! trait shape in `eligibility.rs` needs to keep matching).
//!
//! So this contract intentionally does exactly one useful thing: an
//! admin can mark a specific borrower address as eligible (or not),
//! and anyone can read that flag. No reputation scoring, no risk
//! model, no history — those are explicitly out of scope (see this
//! task's own "IMPLEMENTATION CONSTRAINTS").
//!
//! # Public interface
//!
//! - `initialize(admin)` — one-time bootstrap; sets the contract's
//!   admin. Fails if already initialized.
//! - `set_eligibility(admin, borrower, eligible)` — admin-only; sets
//!   whether `borrower` is currently eligible to have a loan request
//!   created on their behalf.
//! - `is_borrower_eligible(borrower) -> bool` — read; `false` for any
//!   address that has never been explicitly marked eligible (deny by
//!   default, matching a real eligibility/reputation gate: an address
//!   must be explicitly approved, not assumed approved).
//!
//! # Authorization
//!
//! `set_eligibility` requires both a valid signature from the caller
//! (`admin.require_auth()`) *and* that the caller is this contract's
//! stored admin — the same two-part pattern `loan_registry` already
//! uses for e.g. `cancel_loan_request`'s ownership check.

#![no_std]

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `initialize` was called on a contract that already has an
    /// admin configured.
    AlreadyInitialized = 1,
    /// An admin-only operation was attempted before `initialize` was
    /// ever called.
    NotInitialized = 2,
    /// The caller is not this contract's configured admin.
    NotAdmin = 3,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// Instance-storage: this contract's admin address.
    Admin,
    /// Persistent-storage entry: whether a specific borrower address
    /// is currently eligible. Absent means "not eligible" (deny by
    /// default) — see `is_borrower_eligible`.
    Eligible(Address),
}

#[contract]
pub struct EligibilityRegistry;

#[contractimpl]
impl EligibilityRegistry {
    /// One-time bootstrap: sets `admin` as this contract's admin.
    /// Requires `admin`'s authorization. Fails with
    /// `Error::AlreadyInitialized` if an admin is already set.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();

        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    /// Sets whether `borrower` is currently eligible. Requires
    /// `admin`'s authorization, and `admin` must be this contract's
    /// stored admin (`Error::NotAdmin` otherwise; `Error::NotInitialized`
    /// if `initialize` was never called).
    pub fn set_eligibility(
        env: Env,
        admin: Address,
        borrower: Address,
        eligible: bool,
    ) -> Result<(), Error> {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        if admin != stored_admin {
            return Err(Error::NotAdmin);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Eligible(borrower), &eligible);
        Ok(())
    }

    /// Returns whether `borrower` is currently eligible. `false` for
    /// any address that has never been explicitly set (deny by
    /// default). This is a plain read — no authorization required, by
    /// design: any contract (e.g. `loan_registry`) must be able to
    /// check eligibility without needing the borrower's signature.
    pub fn is_borrower_eligible(env: Env, borrower: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Eligible(borrower))
            .unwrap_or(false)
    }
}
