#![cfg(test)]

use super::{EligibilityRegistry, EligibilityRegistryClient, Error};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, EligibilityRegistryClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, EligibilityRegistry);
    let client = EligibilityRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    (env, client, admin)
}

#[test]
fn a_borrower_that_was_never_configured_is_not_eligible_by_default() {
    let (env, client, _admin) = setup();
    let borrower = Address::generate(&env);

    assert!(!client.is_borrower_eligible(&borrower));
}

#[test]
fn the_admin_can_mark_a_borrower_eligible() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
    let borrower = Address::generate(&env);

    client.set_eligibility(&admin, &borrower, &true);

    assert!(client.is_borrower_eligible(&borrower));
}

#[test]
fn the_admin_can_revoke_a_borrowers_eligibility() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
    let borrower = Address::generate(&env);
    client.set_eligibility(&admin, &borrower, &true);

    client.set_eligibility(&admin, &borrower, &false);

    assert!(!client.is_borrower_eligible(&borrower));
}

#[test]
fn initialize_cannot_be_called_twice() {
    let (_env, client, admin) = setup();
    client.initialize(&admin);

    let result = client.try_initialize(&admin);

    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn set_eligibility_fails_before_initialize() {
    let (env, client, admin) = setup();
    let borrower = Address::generate(&env);

    let result = client.try_set_eligibility(&admin, &borrower, &true);

    assert_eq!(result, Err(Ok(Error::NotInitialized)));
}

#[test]
fn a_non_admin_cannot_set_eligibility() {
    let (env, client, admin) = setup();
    client.initialize(&admin);
    let stranger = Address::generate(&env);
    let borrower = Address::generate(&env);

    let result = client.try_set_eligibility(&stranger, &borrower, &true);

    assert_eq!(result, Err(Ok(Error::NotAdmin)));
    // The rejected attempt must not have changed the borrower's
    // eligibility.
    assert!(!client.is_borrower_eligible(&borrower));
}
