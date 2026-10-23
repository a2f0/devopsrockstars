import {expect, test} from 'bun:test';
import {serialized} from './ordered';

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {promise, resolve, reject};
}

test('a request starts only after the previous one finishes, failed or not', async () => {
  const shown: string[] = [];
  const started: string[] = [];
  const apply = serialized<string>(value => shown.push(value));
  const first = deferred<string>();
  const second = deferred<string>();
  const third = deferred<string>();
  const runs = [
    apply(() => {
      started.push('first');
      return first.promise;
    }),
    apply(() => {
      started.push('second');
      return second.promise;
    }),
    apply(() => {
      started.push('third');
      return third.promise;
    }),
  ];
  await Bun.sleep(0);
  expect(started).toEqual(['first']);
  first.reject(new Error('conflict'));
  await expect(runs[0]).rejects.toThrow('conflict');
  await Bun.sleep(0);
  expect(started).toEqual(['first', 'second']);
  second.resolve('second save');
  await runs[1];
  third.resolve('reload');
  await runs[2];
  expect(started).toEqual(['first', 'second', 'third']);
  expect(shown).toEqual(['second save', 'reload']);
});
