import type {PendingCheckout} from './storage';

/**
 * Where the checkout page is between entering an address and paying.
 *
 * - `entering`: no reservation; the shipping form is open.
 * - `reserving`: the form was submitted. `replacing` is the reservation a new
 *   address releases first; it is cleared once that release succeeds.
 * - `reserved`: the reservation and its payment form are shown.
 * - `editing`: the reservation is kept while its address is edited.
 * - `canceling`: the reservation is being canceled without a payment form.
 */
export type CheckoutFlow =
  | {readonly status: 'entering'}
  | {readonly status: 'reserving'; readonly replacing: PendingCheckout | null}
  | {readonly status: 'reserved'; readonly reservation: PendingCheckout}
  | {readonly status: 'editing'; readonly reservation: PendingCheckout}
  | {readonly status: 'canceling'; readonly reservation: PendingCheckout};

export type CheckoutFlowEvent =
  | {readonly type: 'edit'}
  | {readonly type: 'keep'}
  | {readonly type: 'reserve'}
  | {readonly type: 'reserved'; readonly reservation: PendingCheckout}
  | {readonly type: 'cancel'}
  | {readonly type: 'released'; readonly orderId: string}
  | {readonly type: 'stopped'};

export function initialCheckoutFlow(
  reservation: PendingCheckout | null
): CheckoutFlow {
  return reservation ? {status: 'reserved', reservation} : {status: 'entering'};
}

/** The reservation the page holds, including one being replaced. */
export function heldReservation(flow: CheckoutFlow): PendingCheckout | null {
  switch (flow.status) {
    case 'entering':
      return null;
    case 'reserving':
      return flow.replacing;
    case 'reserved':
    case 'editing':
    case 'canceling':
      return flow.reservation;
    default:
      return assertNever(flow);
  }
}

/** The reservation shown with its payment form, hidden while editing. */
export function shownReservation(flow: CheckoutFlow): PendingCheckout | null {
  return flow.status === 'reserved' || flow.status === 'canceling'
    ? flow.reservation
    : null;
}

/** An address edit stays open until the reservation it replaces is gone. */
export function editingAddress(flow: CheckoutFlow) {
  return (
    flow.status === 'editing' ||
    (flow.status === 'reserving' && flow.replacing !== null)
  );
}

/**
 * Applies one event. An event that does not apply in the current state, such
 * as a second submit while reserving, leaves the state unchanged.
 */
export function transitionCheckoutFlow(
  flow: CheckoutFlow,
  event: CheckoutFlowEvent
): CheckoutFlow {
  switch (event.type) {
    case 'edit':
      return flow.status === 'reserved'
        ? {status: 'editing', reservation: flow.reservation}
        : flow;
    case 'keep':
      return flow.status === 'editing'
        ? {status: 'reserved', reservation: flow.reservation}
        : flow;
    case 'reserve':
      if (flow.status === 'entering')
        return {status: 'reserving', replacing: null};
      if (flow.status === 'editing')
        return {status: 'reserving', replacing: flow.reservation};
      return flow;
    case 'reserved':
      return flow.status === 'reserving'
        ? {status: 'reserved', reservation: event.reservation}
        : flow;
    case 'cancel':
      return flow.status === 'reserved'
        ? {status: 'canceling', reservation: flow.reservation}
        : flow;
    case 'released': {
      // Only the reservation the page still holds can be released.
      if (heldReservation(flow)?.checkout.orderId !== event.orderId)
        return flow;
      return flow.status === 'reserving'
        ? {status: 'reserving', replacing: null}
        : {status: 'entering'};
    }
    case 'stopped':
      // A request ended without a new reservation: failed, or left for the
      // receipt. The page returns to where the request started.
      if (flow.status === 'reserving')
        return flow.replacing
          ? {status: 'editing', reservation: flow.replacing}
          : {status: 'entering'};
      if (flow.status === 'canceling')
        return {status: 'reserved', reservation: flow.reservation};
      return flow;
    default:
      return assertNever(event);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled checkout flow value: ${JSON.stringify(value)}`);
}
