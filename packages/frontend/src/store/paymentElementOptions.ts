import type {StripePaymentElementOptions} from '@stripe/stripe-js';

// Billing details come from the shipping form, so the element never asks.
// Link would offer Klarna alongside card, so it stays off to keep checkout
// card-only.
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
