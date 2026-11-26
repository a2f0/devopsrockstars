import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  hatMayPrepare,
  initialModelPreparation,
  type ModelPreparation,
  type ModelPreparationEvent,
  skylineMayPrepare,
  transitionModelPreparation,
} from './modelPreparation';

const skylineFirst: ModelPreparation = {status: 'skylineFirst'};
const hatFirst: ModelPreparation = {status: 'hatFirst'};
const released: ModelPreparation = {status: 'released'};

test('starts with the model the first page shows', () => {
  const cases: ReadonlyArray<readonly [string, ModelPreparation]> = [
    ['/', skylineFirst],
    ['/store', hatFirst],
    ['/store/', hatFirst],
    ['/company', hatFirst],
    ['/search', hatFirst],
    ['/store/checkout', hatFirst],
    ['/missing', hatFirst],
  ];
  for (const [pathname, expected] of cases) {
    assert.deepEqual(initialModelPreparation(pathname), expected, pathname);
  }
});

test('releases the waiting model when the first settles or its page opens', () => {
  const route = (pathname: string): ModelPreparationEvent => ({
    type: 'routeChanged',
    pathname,
  });
  const cases: ReadonlyArray<
    readonly [ModelPreparation, ModelPreparationEvent, ModelPreparation]
  > = [
    [skylineFirst, {type: 'skylineSettled'}, released],
    [skylineFirst, {type: 'hatSettled'}, skylineFirst],
    [skylineFirst, route('/'), skylineFirst],
    [skylineFirst, route('/company'), skylineFirst],
    [skylineFirst, route('/store/checkout'), skylineFirst],
    [skylineFirst, route('/store'), released],
    [skylineFirst, route('/store/'), released],
    [hatFirst, {type: 'hatSettled'}, released],
    [hatFirst, {type: 'skylineSettled'}, hatFirst],
    [hatFirst, route('/store'), hatFirst],
    [hatFirst, route('/company'), hatFirst],
    [hatFirst, route('/'), released],
    [released, {type: 'skylineSettled'}, released],
    [released, {type: 'hatSettled'}, released],
    [released, route('/'), released],
    [released, route('/store'), released],
  ];
  for (const [state, event, expected] of cases) {
    assert.deepEqual(
      transitionModelPreparation(state, event),
      expected,
      `${state.status} + ${JSON.stringify(event)}`
    );
  }
});

test('holds only the waiting model', () => {
  assert.deepEqual(
    [skylineFirst, hatFirst, released].map(state => [
      skylineMayPrepare(state),
      hatMayPrepare(state),
    ]),
    [
      [true, false],
      [false, true],
      [true, true],
    ]
  );
});
