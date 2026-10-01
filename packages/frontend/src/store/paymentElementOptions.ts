import type {StripePaymentElementOptions} from '@stripe/stripe-js';

// Billing details come from the shipping form, so the element never asks.
// Link would offer Klarna alongside card, so it stays off to keep checkout
// card-only. `wallets` accepts `applePay`, `googlePay`, and `link`:
// https://docs.stripe.com/js/elements_object/create_payment_element#payment_element_create-options-wallets
export const PAYMENT_ELEMENT_OPTIONS: StripePaymentElementOptions = {
  fields: {
    billingDetails: {
      address: 'never',
      email: 'never',
      name: 'never',
    },
  },
  layout: 'tabs',
  wallets: {link: 'never'},
};
