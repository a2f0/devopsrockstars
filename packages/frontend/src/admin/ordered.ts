// Inventory saves and reloads each return the whole inventory. Running them
// one at a time makes the server apply them in the order they were made, so
// each response shown is at least as new as the one before it.
export function serialized<T>(show: (value: T) => void) {
  let previous: Promise<unknown> = Promise.resolve();
  return (start: () => Promise<T>): Promise<void> => {
    const run = previous.then(start).then(show);
    previous = run.catch(() => {});
    return run;
  };
}
