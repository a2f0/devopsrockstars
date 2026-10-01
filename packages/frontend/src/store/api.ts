import type {
  CreateCheckoutRequest,
  CreateCheckoutResponse,
  StoreErrorResponse,
  StorefrontResponse,
  StoreOrderResponse,
} from '@devopsrockstars/shared-types';
import {storeApiOrigin} from '../environment';

class StoreApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'StoreApiError';
    this.code = code;
  }
}

// Each deployed environment serves the store API from its own Worker, so the
// origin is baked in at build time. Development and the browser tests leave it
// empty and stay same-origin.
function apiUrl(path: string) {
  return storeApiOrigin ? new URL(path, storeApiOrigin).href : path;
}

// Chromium silently retries a GET over a dropped or stale connection but not a
// POST, so a checkout can fail once with a bare "Failed to fetch". Retry a
// network failure once. That is safe for checkout too: the store allows one
// active checkout per browser, so a repeated request cannot reserve twice.
async function send(path: string, init: RequestInit = {}) {
  try {
    return await fetch(apiUrl(path), init);
  } catch (error) {
    if (init.signal?.aborted) throw error;
  }
  try {
    return await fetch(apiUrl(path), init);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new StoreApiError(
      'network_error',
      'The store could not be reached. Check your connection and try again.'
    );
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) {
      throw new StoreApiError('request_failed', 'The store request failed.');
    }
    throw new StoreApiError(
      'invalid_response',
      'The store returned an invalid response.'
    );
  }
  if (!response.ok) {
    const errorBody =
      typeof body === 'object' && body !== null
        ? (body as Partial<StoreErrorResponse>)
        : {};
    throw new StoreApiError(
      errorBody.error?.code ?? 'request_failed',
      errorBody.error?.message ?? 'The store request failed.'
    );
  }
  return body as T;
}

export async function loadStorefront(signal?: AbortSignal) {
  const response = await send('/api/storefront', signal ? {signal} : {});
  return readResponse<StorefrontResponse>(response);
}

export async function createCheckout(
  request: CreateCheckoutRequest,
  checkoutClientToken: string
) {
  const response = await send('/api/checkouts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Checkout-Client': checkoutClientToken,
    },
    body: JSON.stringify(request),
  });
  return readResponse<CreateCheckoutResponse>(response);
}

export async function loadOrder(
  orderId: string,
  orderToken: string,
  signal?: AbortSignal
) {
  const response = await send(`/api/orders/${encodeURIComponent(orderId)}`, {
    headers: {'X-Order-Token': orderToken},
    ...(signal ? {signal} : {}),
  });
  return readResponse<StoreOrderResponse>(response);
}

export async function cancelCheckout(orderId: string, orderToken: string) {
  const response = await send(
    `/api/orders/${encodeURIComponent(orderId)}/cancel`,
    {
      method: 'POST',
      headers: {'X-Order-Token': orderToken},
    }
  );
  return readResponse<StoreOrderResponse>(response);
}
