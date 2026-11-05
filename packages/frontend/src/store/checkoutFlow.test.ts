import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  type CheckoutFlow,
  type CheckoutFlowEvent,
  editingAddress,
  heldReservation,
  initialCheckoutFlow,
  shownReservation,
  transitionCheckoutFlow,
} from './checkoutFlow';
import type {PendingCheckout} from './storage';

function pending(orderId: string): PendingCheckout {
  return {
    checkout: {
      clientSecret: `${orderId}_secret`,
      currency: 'usd',
      expiresAt: '2026-01-01T00:10:00.000Z',
      lines: [],
      orderId,
      orderToken: `${orderId}_token`,
      totalAmount: 3500,
    },
    shipping: {
      name: 'Ada',
      email: 'ada@example.com',
      addressLine1: '1 Main St',
      addressLine2: '',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62701',
      country: 'US',
    },
  };
}

const first = pending('order_1');
const second = pending('order_2');

const entering: CheckoutFlow = {status: 'entering'};
const reserving: CheckoutFlow = {status: 'reserving', replacing: null};
const replacing: CheckoutFlow = {status: 'reserving', replacing: first};
const reserved: CheckoutFlow = {status: 'reserved', reservation: first};
const editing: CheckoutFlow = {status: 'editing', reservation: first};
const canceling: CheckoutFlow = {status: 'canceling', reservation: first};

const released = (orderId: string): CheckoutFlowEvent => ({
  type: 'released',
  orderId,
});

const legal: ReadonlyArray<
  readonly [string, CheckoutFlow, CheckoutFlowEvent, CheckoutFlow]
> = [
  ['entering submits', entering, {type: 'reserve'}, reserving],
  ['editing submits a new address', editing, {type: 'reserve'}, replacing],
  [
    'the old reservation is released',
    replacing,
    released('order_1'),
    reserving,
  ],
  [
    'the new reservation is made',
    reserving,
    {type: 'reserved', reservation: second},
    {status: 'reserved', reservation: second},
  ],
  ['a first reservation fails', reserving, {type: 'stopped'}, entering],
  ['a replacement fails before release', replacing, {type: 'stopped'}, editing],
  ['edit opens the address', reserved, {type: 'edit'}, editing],
  ['keep closes it unchanged', editing, {type: 'keep'}, reserved],
  ['cancel without a payment form', reserved, {type: 'cancel'}, canceling],
  ['the cancellation succeeds', canceling, released('order_1'), entering],
  ['the cancellation fails', canceling, {type: 'stopped'}, reserved],
  ['the payment form cancels', reserved, released('order_1'), entering],
];

for (const [name, state, event, next] of legal) {
  test(`legal: ${name}`, () => {
    assert.deepEqual(transitionCheckoutFlow(state, event), next);
  });
}

const ignored: ReadonlyArray<readonly [CheckoutFlow, CheckoutFlowEvent]> = [
  [entering, {type: 'edit'}],
  [entering, {type: 'keep'}],
  [entering, {type: 'cancel'}],
  [entering, {type: 'stopped'}],
  [entering, {type: 'reserved', reservation: second}],
  [entering, released('order_1')],
  [reserving, {type: 'reserve'}],
  [reserving, {type: 'edit'}],
  [reserving, {type: 'cancel'}],
  [replacing, {type: 'keep'}],
  [reserved, {type: 'reserve'}],
  [reserved, {type: 'keep'}],
  [reserved, {type: 'stopped'}],
  [reserved, {type: 'reserved', reservation: second}],
  [reserved, released('order_2')],
  [editing, {type: 'edit'}],
  [editing, {type: 'cancel'}],
  [editing, {type: 'stopped'}],
  [canceling, {type: 'cancel'}],
  [canceling, {type: 'edit'}],
  [canceling, {type: 'reserve'}],
];

for (const [state, event] of ignored) {
  test(`ignores ${event.type} while ${state.status}`, () => {
    assert.equal(transitionCheckoutFlow(state, event), state);
  });
}

test('a finished reservation outlives the request it ended', () => {
  // startPayment dispatches `reserved` and then, in its finally block,
  // `stopped`; the second must not undo the first.
  const events: CheckoutFlowEvent[] = [
    {type: 'reserve'},
    {type: 'reserved', reservation: first},
    {type: 'stopped'},
  ];
  assert.deepEqual(events.reduce(transitionCheckoutFlow, entering), reserved);
});

test('a replacement keeps the address open until the old order is released', () => {
  let flow = transitionCheckoutFlow(editing, {type: 'reserve'});
  assert.equal(editingAddress(flow), true);
  assert.equal(heldReservation(flow), first);
  assert.equal(shownReservation(flow), null);
  flow = transitionCheckoutFlow(flow, released('order_1'));
  assert.equal(editingAddress(flow), false);
  assert.equal(heldReservation(flow), null);
  flow = transitionCheckoutFlow(flow, {type: 'reserved', reservation: second});
  assert.equal(shownReservation(flow), second);
});

test('a release for another order cannot drop the current reservation', () => {
  const events: CheckoutFlowEvent[] = [
    {type: 'edit'},
    {type: 'reserve'},
    released('order_1'),
    {type: 'reserved', reservation: second},
    released('order_1'),
  ];
  assert.deepEqual(events.reduce(transitionCheckoutFlow, reserved), {
    status: 'reserved',
    reservation: second,
  });
});

test('derives the page from one state', () => {
  assert.deepEqual(initialCheckoutFlow(null), entering);
  assert.deepEqual(initialCheckoutFlow(first), reserved);
  assert.equal(shownReservation(canceling), first);
  assert.equal(shownReservation(editing), null);
  assert.equal(heldReservation(editing), first);
  assert.equal(editingAddress(reserving), false);
  assert.equal(editingAddress(editing), true);
});
