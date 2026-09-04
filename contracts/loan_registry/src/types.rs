//! Domain types stored/returned by this contract.
//!
//! Split out of the former `state.rs` (L3-P06) into just the domain
//! shapes — storage keys and access now live in `storage.rs` instead.
//!
//! `LoanStatus` (L3-P08) now names the full P2P lending domain state
//! machine this contract is the foundation for — `Open`, `Cancelled`,
//! `Funded`, `Repaying`, `Repaid`, `Defaulted` — but this contract
//! only ever produces `Open` and `Cancelled` values: the other four
//! variants exist purely as type representation so the future
//! funding/repayment contract work
//! (`06_LEVEL_IMPLEMENTATION_PLAN.md`'s Level 3/4 P2P features) has a
//! shared vocabulary to extend into, without any later migration of
//! already-stored `LoanStatus` values. No code path in this crate
//! constructs, matches on, or transitions into any of the four
//! inactive variants — see `validation.rs`'s `require_transition` for
//! the single, explicit place the currently-supported transition
//! (`Open -> Cancelled`) is enforced.

use soroban_sdk::{contracttype, Address};

/// A borrower's request for a loan. Intentionally minimal: no
/// lender, funding, interest, or repayment state yet — this is the
/// first on-chain primitive the future P2P lending/funding contract
/// work will build on.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LoanRequest {
    /// The address that created (and is the only address that may
    /// cancel) this loan request.
    pub borrower: Address,
    /// Requested loan amount, in the smallest unit of whatever asset
    /// a future funding contract will use. Deliberately asset-
    /// agnostic here: no token/asset identifier is stored, since
    /// wiring up an actual funding/payment flow is out of scope for
    /// this contract.
    pub amount: i128,
    pub status: LoanStatus,
}

/// The full P2P lending loan domain state machine (L3-P08). Only
/// `Open` and `Cancelled` are reachable through this contract's
/// current entrypoints — see the module-level docs above.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[allow(dead_code)] // Funded/Repaying/Repaid/Defaulted: type representation only, not yet reachable — see module docs.
pub enum LoanStatus {
    /// Awaiting funding. The only status a newly created loan
    /// request can have.
    Open,
    /// Withdrawn by the borrower before being funded.
    Cancelled,
    /// A lender has funded the loan. No code path in this contract
    /// currently produces this state — reserved for the future
    /// funding contract work.
    Funded,
    /// The borrower is actively repaying a funded loan. No code path
    /// in this contract currently produces this state — reserved for
    /// the future repayment contract work.
    Repaying,
    /// The loan has been fully repaid. No code path in this contract
    /// currently produces this state — reserved for the future
    /// repayment contract work.
    Repaid,
    /// The borrower failed to meet repayment obligations. No code
    /// path in this contract currently produces this state — reserved
    /// for the future default/liquidation contract work.
    Defaulted,
}

/// The state of one loan's optional locked collateral (L3-P11).
/// Deliberately just `None -> Locked -> Released`: no partial-lock,
/// top-up, or liquidation states — those depend on funding/valuation
/// work this contract does not implement yet (see `collateral.rs`).
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[allow(dead_code)] // `None` is never constructed — a loan with no collateral simply has no `Collateral` record at all (`storage::get_collateral` returns `Option::None`). It exists here only to name the starting point of the lifecycle.
pub enum CollateralStatus {
    /// No collateral has ever been locked for the loan. Not actually
    /// stored — see the variant doc above.
    None,
    /// Tokens have been transferred into this contract and are held
    /// in escrow on the borrower's behalf.
    Locked,
    /// Tokens have been transferred back to the borrower. Currently
    /// only reachable via `cancel_loan_request` — see `collateral.rs`.
    Released,
}

/// A record of collateral locked (and, later, released) for one loan
/// request (L3-P11). Deliberately minimal — asset and amount only.
/// No price, valuation, USD amount, or collateral-to-loan ratio is
/// stored or computed here; that is explicitly out of scope for this
/// task (see `collateral.rs`'s module docs).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Collateral {
    /// The loan request this collateral secures.
    pub loan_id: u64,
    /// The address that locked the collateral. Always equal to the
    /// loan's own `borrower` — `collateral::lock` enforces this via
    /// `validation::require_owner` before any tokens move.
    pub borrower: Address,
    /// The token contract address of the locked asset. Any SEP-41-
    /// compatible token (including a Stellar Asset Contract) is
    /// accepted; this contract does not restrict which asset may be
    /// used as collateral.
    pub token: Address,
    /// The amount of `token` locked, in its smallest unit.
    pub amount: i128,
    pub status: CollateralStatus,
}
