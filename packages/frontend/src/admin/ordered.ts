// Requests that each return the whole view can finish out of order. Show a
// response only when no later request's response is already shown.
export function inRequestOrder<T>(show: (value: T) => void) {
  let issued = 0;
  let shown = 0;
  return async (request: Promise<T>) => {
    const sequence = ++issued;
    const value = await request;
    if (sequence < shown) return;
    shown = sequence;
    show(value);
  };
}
