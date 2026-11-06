/**
 * Loading the Stripe Payment Element, apart from what the buttons do.
 *
 * - `loading`: the form for `request` is still loading.
 * - `ready`: the form for `request` can take a payment.
 * - `failed`: the form for `request` could not be loaded. Paying or canceling
 *   never clears this; only a new load (a new checkout) replaces it.
 *
 * Each load carries the request that started it, so a superseded load cannot
 * finish the one that replaced it.
 */
export type PaymentFormLoad =
  | {readonly status: 'loading'; readonly request: number}
  | {readonly status: 'ready'; readonly request: number}
  | {readonly status: 'failed'; readonly request: number};

export type PaymentFormLoadEvent =
  | {readonly type: 'start'; readonly request: number}
  | {readonly type: 'ready'; readonly request: number}
  | {readonly type: 'fail'; readonly request: number};

export const initialPaymentFormLoad: PaymentFormLoad = {
  status: 'loading',
  request: 0,
};

/** Only the load that is still current, and still loading, may finish. */
const loadingRequest = (load: PaymentFormLoad, request: number) =>
  load.status === 'loading' && load.request === request;

export function transitionPaymentFormLoad(
  load: PaymentFormLoad,
  event: PaymentFormLoadEvent
): PaymentFormLoad {
  switch (event.type) {
    case 'start':
      return {status: 'loading', request: event.request};
    case 'ready':
      return loadingRequest(load, event.request)
        ? {status: 'ready', request: event.request}
        : load;
    case 'fail':
      return loadingRequest(load, event.request)
        ? {status: 'failed', request: event.request}
        : load;
    default:
      return assertNever(event);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled payment form event: ${JSON.stringify(value)}`);
}
