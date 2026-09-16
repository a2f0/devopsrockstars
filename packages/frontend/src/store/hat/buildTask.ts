/** Cooperative CPU work: allow input/paint between slices and cancel on unmount. */
export class BuildTask {
  #started = performance.now();

  constructor(readonly signal?: AbortSignal) {}

  async checkpoint(force = false) {
    this.signal?.throwIfAborted();
    if (force || performance.now() - this.#started >= 8) {
      // A timer yields to the browser's task queue; a resolved Promise does not.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      this.#started = performance.now();
      this.signal?.throwIfAborted();
    }
  }
}
