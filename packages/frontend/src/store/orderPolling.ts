// How long the receipt waits between order status reads while a payment is
// confirming.
export const ORDER_POLL_INTERVAL_MS = 1500;
const MAX_RETRY_DELAY_MS = 15_000;
// About a minute of consecutive transient failures before giving up.
const MAX_FAILED_READS = 6;

// The wait before reading the order again after `failedReads` consecutive
// transient failures, doubling up to a cap, or null once the receipt should
// stop and report the failure.
export function orderRetryDelay(failedReads: number): number | null {
  if (failedReads < 1 || failedReads > MAX_FAILED_READS) return null;
  return Math.min(
    ORDER_POLL_INTERVAL_MS * 2 ** (failedReads - 1),
    MAX_RETRY_DELAY_MS
  );
}
