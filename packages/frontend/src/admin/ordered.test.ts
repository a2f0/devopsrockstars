import {expect, test} from 'bun:test';
import {inRequestOrder} from './ordered';

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return {promise, resolve};
}

test('a slower earlier response never replaces a newer one', async () => {
  const shown: string[] = [];
  const apply = inRequestOrder<string>(value => shown.push(value));
  const first = deferred<string>();
  const second = deferred<string>();
  const applyingFirst = apply(first.promise);
  const applyingSecond = apply(second.promise);
  second.resolve('second save');
  await applyingSecond;
  first.resolve('first save');
  await applyingFirst;
  expect(shown).toEqual(['second save']);

  const third = deferred<string>();
  const applyingThird = apply(third.promise);
  third.resolve('reload');
  await applyingThird;
  expect(shown).toEqual(['second save', 'reload']);
});
