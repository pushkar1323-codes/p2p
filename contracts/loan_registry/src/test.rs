#![cfg(test)]

use super::{Error, LoanRegistry, LoanRegistryClient};
use crate::state::LoanStatus;
use soroban_sdk::{
    symbol_short, testutils::Address as _, testutils::Events as _, vec, Address, Env, IntoVal,
};

fn setup() -> (Env, LoanRegistryClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, LoanRegistry);
    let client = LoanRegistryClient::new(&env, &contract_id);
    let borrower = Address::generate(&env);
    (env, client, borrower)
}

#[test]
fn create_loan_request_stores_an_open_loan_with_the_given_fields() {
    let (_env, client, borrower) = setup();

    let loan_id = client.create_loan_request(&borrower, &1_000i128);
    assert_eq!(loan_id, 1);

    let loan = client.get_loan_request(&loan_id);
    assert_eq!(loan.borrower, borrower);
    assert_eq!(loan.amount, 1_000);
    assert_eq!(loan.status, LoanStatus::Open);
}

#[test]
fn loan_ids_increment_sequentially_and_the_count_tracks_the_total() {
    let (_env, client, borrower) = setup();
    assert_eq!(client.get_loan_count(), 0);

    let first = client.create_loan_request(&borrower, &500i128);
    let second = client.create_loan_request(&borrower, &750i128);

    assert_eq!(first, 1);
    assert_eq!(second, 2);
    assert_eq!(client.get_loan_count(), 2);
}

#[test]
fn create_loan_request_rejects_a_zero_amount() {
    let (_env, client, borrower) = setup();

    let result = client.try_create_loan_request(&borrower, &0i128);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
    // A rejected request must not consume a loan id or affect the count.
    assert_eq!(client.get_loan_count(), 0);
}

#[test]
fn create_loan_request_rejects_a_negative_amount() {
    let (_env, client, borrower) = setup();

    let result = client.try_create_loan_request(&borrower, &-10i128);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn the_borrower_can_cancel_their_own_open_loan() {
    let (_env, client, borrower) = setup();
    let loan_id = client.create_loan_request(&borrower, &1_000i128);

    client.cancel_loan_request(&borrower, &loan_id);

    let loan = client.get_loan_request(&loan_id);
    assert_eq!(loan.status, LoanStatus::Cancelled);
}

#[test]
fn cancelling_an_already_cancelled_loan_fails() {
    let (_env, client, borrower) = setup();
    let loan_id = client.create_loan_request(&borrower, &1_000i128);
    client.cancel_loan_request(&borrower, &loan_id);

    let result = client.try_cancel_loan_request(&borrower, &loan_id);
    assert_eq!(result, Err(Ok(Error::LoanNotOpen)));
}

#[test]
fn a_different_address_cannot_cancel_someone_elses_loan() {
    let (env, client, borrower) = setup();
    let loan_id = client.create_loan_request(&borrower, &1_000i128);
    let stranger = Address::generate(&env);

    let result = client.try_cancel_loan_request(&stranger, &loan_id);
    assert_eq!(result, Err(Ok(Error::NotLoanOwner)));

    // The original loan must be unaffected by the failed attempt.
    let loan = client.get_loan_request(&loan_id);
    assert_eq!(loan.status, LoanStatus::Open);
}

#[test]
fn create_loan_request_emits_a_created_event_with_loan_id_and_amount() {
    let (env, client, borrower) = setup();

    let loan_id = client.create_loan_request(&borrower, &1_000i128);

    let events = env.events().all();
    assert_eq!(events.len(), 1);
    assert_eq!(
        events,
        vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("created"), borrower.clone()).into_val(&env),
                (loan_id, 1_000i128).into_val(&env),
            ),
        ]
    );
}

#[test]
fn cancel_loan_request_emits_a_cancelled_event_with_loan_id() {
    let (env, client, borrower) = setup();
    let loan_id = client.create_loan_request(&borrower, &1_000i128);

    client.cancel_loan_request(&borrower, &loan_id);

    // Two events total: the `created` event from above, then
    // `cancelled`. Only the second (most recent) is asserted here —
    // wrapped in a `soroban_sdk::vec!` on both sides (rather than
    // comparing the raw tuple with `==`) because `Val` itself isn't
    // directly `PartialEq`; the SDK's `Vec` wrapper compares via the
    // host environment instead, which is the same mechanism the
    // `created`-event test above already relies on.
    let events = env.events().all();
    assert_eq!(events.len(), 2);
    assert_eq!(
        vec![&env, events.get(1).unwrap().clone()],
        vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("cancelled"), borrower.clone()).into_val(&env),
                loan_id.into_val(&env),
            ),
        ]
    );
}

#[test]
fn a_failed_create_loan_request_does_not_emit_a_created_event() {
    let (env, client, borrower) = setup();

    let _ = client.try_create_loan_request(&borrower, &0i128);

    assert_eq!(env.events().all().len(), 0);
}

#[test]
fn a_failed_cancel_loan_request_does_not_emit_a_cancelled_event() {
    let (env, client, borrower) = setup();
    let loan_id = client.create_loan_request(&borrower, &1_000i128);
    let stranger = Address::generate(&env);

    let _ = client.try_cancel_loan_request(&stranger, &loan_id);

    // Only the earlier `created` event should be present — the
    // rejected cancellation by a non-owner must not emit anything.
    let events = env.events().all();
    assert_eq!(events.len(), 1);
    assert_eq!(
        vec![&env, events.get(0).unwrap().clone()],
        vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("created"), borrower.clone()).into_val(&env),
                (loan_id, 1_000i128).into_val(&env),
            ),
        ]
    );
}

#[test]
fn cancelling_a_nonexistent_loan_fails() {
    let (_env, client, borrower) = setup();

    let result = client.try_cancel_loan_request(&borrower, &999u64);
    assert_eq!(result, Err(Ok(Error::LoanNotFound)));
}

#[test]
fn reading_a_nonexistent_loan_fails() {
    let (_env, client, _borrower) = setup();

    let result = client.try_get_loan_request(&999u64);
    assert_eq!(result, Err(Ok(Error::LoanNotFound)));
}
