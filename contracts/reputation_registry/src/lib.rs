//! Reputation registry — a minimal, verifiable on-chain reputation
//! foundation for borrower/lender trust (L3-P09).
//!
//! # Why this contract exists
//!
//! A P2P lending protocol eventually needs some notion of borrower
//! trust to inform lender decisions and loan terms
//! (`02_PROJECT_BRAIN.md`'s "borrower reputation"/"risk assessment"
//! feature). That eventually means scoring, weighting, and possibly
//! off-chain behavioral analysis — none of which belongs on-chain,
//! and none of which this contract attempts. What *does* need to be
//! on-chain is the raw, verifiable record those future systems would
//! be built on: how many loans a borrower has actually completed or
//! defaulted on. This contract stores exactly that — three counters
//! per borrower — and nothing else.
//!
//! # Why counters, not a score
//!
//! A "reputation score" is a policy decision (how much should one
//! default outweigh ten completions? does recency matter?) that will
//! change as the product evolves, and is exactly the kind of
//! computation `02_PROJECT_BRAIN.md`'s architecture principles keep
//! off-chain ("backend handles ... risk assessment ... personalized
//! loan terms"). Storing raw counters on-chain instead means the
//! underlying facts stay verifiable and immutable-by-history, while
//! any future scoring formula (on the backend, or in a later
//! contract) can be recomputed or changed without needing to migrate
//! on-chain state.
//!
//! # Why counters aren't caller-editable
//!
//! Nothing here lets a borrower — or anyone other than this
//! contract's configured admin — change their own counters. If a
//! borrower could inflate their own completed-loan count, the record
//! would be worthless to lenders relying on it. For this stage, the
//! admin is the sole authorized recorder (see `initialize`); once a
//! real lending lifecycle contract exists, it (not individual
//! borrowers) would be the authorized caller instead. This contract
//! deliberately does not call, or get called by, `loan_registry` yet
//! — there is no real completed/defaulted loan lifecycle for it to
//! react to — see `06_LEVEL_IMPLEMENTATION_PLAN.md` for where that
//! future integration belongs.
//!
//! # Public interface
//!
//! - `initialize(admin)` — one-time bootstrap; sets this contract's
//!   admin, the only address authorized to record outcomes.
//! - `record_loan_completed(admin, borrower)` — admin-only; increments
//!   `borrower`'s `completed_loans` and `total_loans` by one.
//! - `record_loan_defaulted(admin, borrower)` — admin-only; increments
//!   `borrower`'s `defaulted_loans` and `total_loans` by one.
//! - `get_reputation(borrower) -> ReputationRecord` — read; returns a
//!   zeroed record for an address with no recorded history rather
//!   than failing, since "no history yet" is an ordinary, expected
//!   case, not an error condition.
//!
//! # State invariant
//!
//! `total_loans == completed_loans + defaulted_loans` always holds,
//! by construction: the only two functions that ever change a
//! borrower's record each increment exactly one outcome counter and
//! `total_loans` together, in the same call, and no function exposes
//! a way to set any of the three fields directly.

#![no_std]

#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env,
};

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
    /// Recording this outcome would overflow a `u64` counter. Returned
    /// instead of silently wrapping, which would corrupt the record.
    CounterOverflow = 4,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// Instance-storage: this contract's admin address.
    Admin,
    /// Persistent-storage entry for one borrower's reputation record.
    Reputation(Address),
}

/// A borrower's verifiable lending outcome counters. Deliberately just
/// counters — no score, rating, or weighting; see the module-level
/// docs above for why.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ReputationRecord {
    /// Total number of outcomes recorded for this borrower
    /// (`completed_loans + defaulted_loans`, always).
    pub total_loans: u64,
    /// Number of loans this borrower has completed (repaid in full).
    pub completed_loans: u64,
    /// Number of loans this borrower has defaulted on.
    pub defaulted_loans: u64,
}

/// The zeroed record returned for a borrower with no recorded
/// history yet.
fn empty_record() -> ReputationRecord {
    ReputationRecord {
        total_loans: 0,
        completed_loans: 0,
        defaulted_loans: 0,
    }
}

/// Reads `borrower`'s stored reputation record, or `empty_record()`
/// if none exists yet. A pure read — never writes to storage.
fn read_reputation(env: &Env, borrower: &Address) -> ReputationRecord {
    env.storage()
        .persistent()
        .get(&DataKey::Reputation(borrower.clone()))
        .unwrap_or_else(empty_record)
}

#[contract]
pub struct ReputationRegistry;

#[contractimpl]
impl ReputationRegistry {
    /// One-time bootstrap: sets `admin` as this contract's admin, the
    /// only address authorized to record loan outcomes. Requires
    /// `admin`'s authorization. Fails with `Error::AlreadyInitialized`
    /// if an admin is already configured.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();

        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    /// Records that `borrower` completed a loan: increments their
    /// `completed_loans` and `total_loans` counters by one. Requires
    /// `admin`'s authorization, and `admin` must be this contract's
    /// configured admin (`Error::NotAdmin` otherwise;
    /// `Error::NotInitialized` if `initialize` was never called).
    /// Returns `Error::CounterOverflow` instead of wrapping if either
    /// counter would overflow.
    ///
    /// Emits a `("completed", borrower)` event with
    /// `(completed_loans, total_loans)` — the borrower's updated
    /// counters — as data.
    pub fn record_loan_completed(env: Env, admin: Address, borrower: Address) -> Result<(), Error> {
        require_recorder(&env, &admin)?;

        let mut record = read_reputation(&env, &borrower);
        record.completed_loans = record
            .completed_loans
            .checked_add(1)
            .ok_or(Error::CounterOverflow)?;
        record.total_loans = record
            .total_loans
            .checked_add(1)
            .ok_or(Error::CounterOverflow)?;

        env.storage()
            .persistent()
            .set(&DataKey::Reputation(borrower.clone()), &record);

        env.events().publish(
            (symbol_short!("completed"), borrower),
            (record.completed_loans, record.total_loans),
        );

        Ok(())
    }

    /// Records that `borrower` defaulted on a loan: increments their
    /// `defaulted_loans` and `total_loans` counters by one. Requires
    /// `admin`'s authorization, and `admin` must be this contract's
    /// configured admin (`Error::NotAdmin` otherwise;
    /// `Error::NotInitialized` if `initialize` was never called).
    /// Returns `Error::CounterOverflow` instead of wrapping if either
    /// counter would overflow.
    ///
    /// Emits a `("defaulted", borrower)` event with
    /// `(defaulted_loans, total_loans)` — the borrower's updated
    /// counters — as data.
    pub fn record_loan_defaulted(env: Env, admin: Address, borrower: Address) -> Result<(), Error> {
        require_recorder(&env, &admin)?;

        let mut record = read_reputation(&env, &borrower);
        record.defaulted_loans = record
            .defaulted_loans
            .checked_add(1)
            .ok_or(Error::CounterOverflow)?;
        record.total_loans = record
            .total_loans
            .checked_add(1)
            .ok_or(Error::CounterOverflow)?;

        env.storage()
            .persistent()
            .set(&DataKey::Reputation(borrower.clone()), &record);

        env.events().publish(
            (symbol_short!("defaulted"), borrower),
            (record.defaulted_loans, record.total_loans),
        );

        Ok(())
    }

    /// Returns `borrower`'s stored reputation record, or a zeroed
    /// record if none exists yet (not an error — see the module-level
    /// docs above). Never modifies state.
    pub fn get_reputation(env: Env, borrower: Address) -> ReputationRecord {
        read_reputation(&env, &borrower)
    }
}

/// Shared authorization check for both recording entrypoints:
/// `caller`'s signature, and that `caller` is this contract's
/// configured admin.
fn require_recorder(env: &Env, caller: &Address) -> Result<(), Error> {
    caller.require_auth();

    let stored_admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)?;
    if *caller != stored_admin {
        return Err(Error::NotAdmin);
    }

    Ok(())
}
