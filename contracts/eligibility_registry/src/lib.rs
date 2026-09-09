//! Eligibility registry — a deliberately minimal dependency contract
//! (L3-P07, self-registration model added in the L3-P07/L3-P14
//! correction).
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
//! # Onboarding model (corrected — see project status docs)
//!
//! The original version of this contract only let an admin grant
//! eligibility, which meant a normal new wallet could never create a
//! loan request without first manually contacting an administrator —
//! unacceptable for a permissionless P2P marketplace. This version
//! replaces admin-grant with borrower **self-registration**, and
//! narrows admin's role to exceptional intervention only:
//!
//! - `register(borrower)` — a borrower marks themselves eligible.
//!   Requires the borrower's own authorization. Idempotent. The one
//!   thing it will not do is un-block a blocked borrower — see below.
//! - `admin_block(admin, borrower)` — admin-only; immediately
//!   ineligible, and `register` will refuse to re-admit them.
//! - `admin_unblock(admin, borrower)` — admin-only; lifts a block by
//!   returning the borrower to **unregistered**, not directly back to
//!   registered. They must call `register` again themselves. This is
//!   deliberate: an admin can stop a borrower, but never silently
//!   opt them back in on their behalf — that authorization is always
//!   the borrower's own to give.
//! - `is_borrower_eligible(borrower) -> bool` — read; unchanged
//!   signature and meaning, so `loan_registry`'s side of this
//!   integration needs no changes at all (see `eligibility.rs` there).
//!   `true` only for a borrower who is currently `Registered`; `false`
//!   for both "never registered" and "blocked" — deny by default is
//!   preserved exactly as before.
//!
//! There is deliberately no admin-grant function anymore (no
//! `set_eligibility(admin, borrower, true)` equivalent): normal
//! eligibility comes only from the borrower's own `register` call.
//!
//! # Authorization
//!
//! `register` requires the borrower's own signature
//! (`borrower.require_auth()`). `admin_block`/`admin_unblock` require
//! both a valid signature from the caller (`admin.require_auth()`)
//! *and* that the caller is this contract's stored admin — the same
//! two-part pattern `loan_registry` already uses for e.g.
//! `cancel_loan_request`'s ownership check and its own
//! `set_eligibility_contract`.

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
    /// An admin-only operation — or `register` — was attempted before
    /// `initialize` was ever called.
    NotInitialized = 2,
    /// The caller is not this contract's configured admin.
    NotAdmin = 3,
    /// `register` was called by a borrower an admin has blocked.
    /// Only `admin_unblock` can lift this — a blocked borrower cannot
    /// re-admit themselves.
    BorrowerBlocked = 4,
}

/// A borrower's current standing. Absent (no stored value at all) is
/// a third, implicit state — "unregistered" — deliberately not a
/// variant here: it is both the default for an address that has never
/// been touched, and the state `admin_unblock` deliberately returns a
/// borrower to (see the module docs above).
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EligibilityState {
    Registered,
    Blocked,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// Instance-storage: this contract's admin address.
    Admin,
    /// Persistent-storage entry: this borrower's current standing.
    /// Absent means "unregistered" (deny by default) — see
    /// `is_borrower_eligible`.
    Eligibility(Address),
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

    /// Borrower self-registration: marks the caller themselves as
    /// eligible. Requires `borrower`'s own authorization — nobody can
    /// register on another address's behalf. Idempotent: calling this
    /// again while already `Registered` is a harmless no-op success,
    /// not an error. Fails with `Error::BorrowerBlocked` if an admin
    /// has blocked this address; fails with `Error::NotInitialized`
    /// if `initialize` was never called.
    pub fn register(env: Env, borrower: Address) -> Result<(), Error> {
        borrower.require_auth();

        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::NotInitialized);
        }

        let key = DataKey::Eligibility(borrower);
        if let Some(EligibilityState::Blocked) = env.storage().persistent().get(&key) {
            return Err(Error::BorrowerBlocked);
        }

        env.storage()
            .persistent()
            .set(&key, &EligibilityState::Registered);
        Ok(())
    }

    /// Admin-only: blocks `borrower`. They become immediately
    /// ineligible, and their own future `register` calls will fail
    /// with `Error::BorrowerBlocked` until `admin_unblock` is called.
    /// Requires `admin`'s authorization, and `admin` must be this
    /// contract's stored admin.
    pub fn admin_block(env: Env, admin: Address, borrower: Address) -> Result<(), Error> {
        require_admin(&env, &admin)?;

        env.storage()
            .persistent()
            .set(&DataKey::Eligibility(borrower), &EligibilityState::Blocked);
        Ok(())
    }

    /// Admin-only: lifts a block on `borrower`, returning them to
    /// *unregistered* — deliberately not directly back to
    /// `Registered`. The borrower must call `register` again
    /// themselves if they still want to be eligible; this contract
    /// never grants eligibility on a borrower's behalf. Requires
    /// `admin`'s authorization, and `admin` must be this contract's
    /// stored admin.
    pub fn admin_unblock(env: Env, admin: Address, borrower: Address) -> Result<(), Error> {
        require_admin(&env, &admin)?;

        env.storage()
            .persistent()
            .remove(&DataKey::Eligibility(borrower));
        Ok(())
    }

    /// Returns whether `borrower` is currently eligible. `true` only
    /// for a borrower who is currently `Registered`; `false` for an
    /// address that has never registered, and `false` for a blocked
    /// one too — deny by default in both cases. This is a plain read
    /// — no authorization required, by design: any contract (e.g.
    /// `loan_registry`) must be able to check eligibility without
    /// needing the borrower's signature.
    pub fn is_borrower_eligible(env: Env, borrower: Address) -> bool {
        matches!(
            env.storage()
                .persistent()
                .get(&DataKey::Eligibility(borrower)),
            Some(EligibilityState::Registered)
        )
    }
}

/// Shared by `admin_block`/`admin_unblock`: requires `admin`'s own
/// authorization, then that `admin` is this contract's stored admin.
/// Not a contract entrypoint itself (no `#[contractimpl]` on this
/// `impl` block) — a private helper only.
fn require_admin(env: &Env, admin: &Address) -> Result<(), Error> {
    admin.require_auth();

    let stored_admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)?;
    if *admin != stored_admin {
        return Err(Error::NotAdmin);
    }
    Ok(())
}
