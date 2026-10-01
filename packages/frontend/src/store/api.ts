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

async function readResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    // A connection that drops mid-body fails the read like a failed fetch.
    if (error instanceof TypeError) throw error;
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

// Chromium silently retries a GET over a dropped or stale connection but not a
// POST, so a checkout can fail once with a bare "Failed to fetch". Retry a
// network failure once, including one while the body is read. That is safe
// for checkout too: the store keeps one active checkout per browser, and an
// identical request resumes it with the same credentials.
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await readResponse<T>(await fetch(apiUrl(path), init));
  } catch (error) {
    if (!(error instanceof TypeError) || init.signal?.aborted) throw error;
  }
  try {
    return await readResponse<T>(await fetch(apiUrl(path), init));
  } catch (error) {
    if (!(error instanceof TypeError) || init.signal?.aborted) throw error;
    throw new StoreApiError(
      'network_error',
      'The store could not be reached. Check your connection and try again.'
    );
  }
}

export async function loadStorefront(signal?: AbortSignal) {
  return request<StorefrontResponse>('/api/storefront', signal ? {signal} : {});
}

export async function createCheckout(
  checkout: CreateCheckoutRequest,
  checkoutClientToken: string
) {
  return request<CreateCheckoutResponse>('/api/checkouts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Checkout-Client': checkoutClientToken,
    },
    body: JSON.stringify(checkout),
  });
}

export async function loadOrder(
  orderId: string,
  orderToken: string,
  signal?: AbortSignal
) {
  return request<StoreOrderResponse>(
    `/api/orders/${encodeURIComponent(orderId)}`,
    {
      headers: {'X-Order-Token': orderToken},
      ...(signal ? {signal} : {}),
    }
  );
}

export async function cancelCheckout(orderId: string, orderToken: string) {
  return request<StoreOrderResponse>(
    `/api/orders/${encodeURIComponent(orderId)}/cancel`,
    {
      method: 'POST',
      headers: {'X-Order-Token': orderToken},
    }
  );
}
