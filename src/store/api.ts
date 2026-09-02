import type {
  CreateCheckoutRequest,
  CreateCheckoutResponse,
  StoreErrorResponse,
  StorefrontResponse,
  StoreOrderResponse,
} from './contracts';

class StoreApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'StoreApiError';
    this.code = code;
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
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
  const response = await fetch('/api/storefront', signal ? {signal} : {});
  return readResponse<StorefrontResponse>(response);
}

export async function createCheckout(request: CreateCheckoutRequest) {
  const response = await fetch('/api/checkouts', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(request),
  });
  return readResponse<CreateCheckoutResponse>(response);
}

export async function loadOrder(
  orderId: string,
  orderToken: string,
  signal?: AbortSignal
) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
    headers: {'X-Order-Token': orderToken},
    ...(signal ? {signal} : {}),
  });
  return readResponse<StoreOrderResponse>(response);
}
