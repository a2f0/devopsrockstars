import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  initialPaymentFormLoad,
  type PaymentFormLoad,
  type PaymentFormLoadEvent,
  transitionPaymentFormLoad,
} from './paymentFormLoad';

const loading = (request: number): PaymentFormLoad => ({
  status: 'loading',
  request,
});
const ready = (request: number): PaymentFormLoad => ({
  status: 'ready',
  request,
});
const failed = (request: number): PaymentFormLoad => ({
  status: 'failed',
  request,
});

const cases: ReadonlyArray<
  readonly [string, PaymentFormLoad, PaymentFormLoadEvent, PaymentFormLoad]
> = [
  ['a load starts', loading(0), {type: 'start', request: 1}, loading(1)],
  ['the form is ready', loading(1), {type: 'ready', request: 1}, ready(1)],
  ['the form fails', loading(1), {type: 'fail', request: 1}, failed(1)],
  [
    'a new checkout reloads a ready form',
    ready(1),
    {type: 'start', request: 2},
    loading(2),
  ],
  [
    'a new checkout reloads a failed form',
    failed(1),
    {type: 'start', request: 2},
    loading(2),
  ],
  [
    'a superseded load cannot become ready',
    loading(2),
    {type: 'ready', request: 1},
    loading(2),
  ],
  [
    'a superseded load cannot fail',
    loading(2),
    {type: 'fail', request: 1},
    loading(2),
  ],
  [
    'a failed form stays failed when it reports ready',
    failed(1),
    {type: 'ready', request: 1},
    failed(1),
  ],
  [
    'a ready form ignores a late failure',
    ready(1),
    {type: 'fail', request: 1},
    ready(1),
  ],
  [
    'a failed form ignores a repeated failure',
    failed(1),
    {type: 'fail', request: 1},
    failed(1),
  ],
];

for (const [name, load, event, next] of cases) {
  test(name, () => {
    assert.deepEqual(transitionPaymentFormLoad(load, event), next);
  });
}

test('starts loading', () => {
  assert.equal(initialPaymentFormLoad.status, 'loading');
});

test('a stale load cannot finish the load that replaced it', () => {
  const events: PaymentFormLoadEvent[] = [
    {type: 'start', request: 1},
    {type: 'start', request: 2},
    {type: 'fail', request: 1},
    {type: 'ready', request: 1},
  ];
  assert.deepEqual(
    events.reduce(transitionPaymentFormLoad, initialPaymentFormLoad),
    loading(2)
  );
});
