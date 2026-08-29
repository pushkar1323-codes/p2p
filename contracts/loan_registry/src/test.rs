#![cfg(test)]

use super::{Error, LoanRegistry, LoanRegistryClient};
use crate::state::LoanStatus;
use soroban_sdk::{testutils::Address as _, Address, Env};

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
