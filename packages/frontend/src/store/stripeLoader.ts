import type {Stripe} from '@stripe/stripe-js';

/**
 * Shares one Stripe instance per publishable key across payment forms.
 * Stripe.js forgets a failed script load so a later call can try again;
 * this cache does the same, so one network failure does not leave every
 * later payment form in the session unable to load.
 */
export function createStripeLoader(
  load: (publishableKey: string) => Promise<Stripe | null>
) {
  let stripeKey: string | null = null;
  let stripePromise: Promise<Stripe | null> | null = null;

  return (publishableKey: string) => {
    if (stripeKey !== publishableKey || !stripePromise) {
      stripeKey = publishableKey;
      const attempt = load(publishableKey);
      stripePromise = attempt;
      attempt.catch(() => {
        // A newer key may have replaced this attempt meanwhile.
        if (stripePromise === attempt) stripePromise = null;
      });
    }
    return stripePromise;
  };
}
