import {loadCatalog} from './catalog';
import {CheckoutCreationError, startCheckout} from './checkout';
import {cleanupExpiredOrders} from './cleanup';
import {sha256} from './crypto';
import {
  apiError,
  corsPreflight,
  hasAllowedOrigin,
  json,
  RequestBodyError,
  readJson,
  withCors,
} from './http';
import {cancelOrder, loadOrder, OrderCancellationError} from './orders';
import type {Env, ExecutionContextLike, ScheduledControllerLike} from './types';
import {CheckoutValidationError, validateCheckout} from './validation';
import {handleStripeWebhook} from './webhook';

const CHECKOUT_RATE_LIMIT_KEY = 'checkout:';
const CHECKOUT_CLIENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function route(request: Request, env: Env) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/storefront') {
    return json(await loadCatalog(env));
  }
  if (request.method === 'POST' && url.pathname === '/api/checkouts') {
    if (!hasAllowedOrigin(request, env.STOREFRONT_ORIGINS)) {
      return apiError(
        'forbidden',
        'Cross-site checkout requests are blocked.',
        403
      );
    }
    const checkoutClientToken =
      request.headers.get('X-Checkout-Client')?.trim() ?? '';
    if (!CHECKOUT_CLIENT_PATTERN.test(checkoutClientToken)) {
      return apiError(
        'invalid_checkout_client',
        'The checkout session is invalid. Reload the page and try again.',
        400
      );
    }
    const hashSecret = env.CHECKOUT_HASH_SECRET?.trim();
    if (!env.CHECKOUT_RATE_LIMITER || !hashSecret) {
      return apiError(
        'checkout_unavailable',
        'Checkout abuse protection is not configured.',
        503
      );
    }
    const clientAddress =
      request.headers.get('CF-Connecting-IP')?.trim() || 'unknown';
    const rateLimitKey = `${CHECKOUT_RATE_LIMIT_KEY}${clientAddress}`;
    const rateLimit = await env.CHECKOUT_RATE_LIMITER.limit({
      key: rateLimitKey,
    });
    if (!rateLimit.success) {
      return apiError(
        'checkout_rate_limited',
        'Too many checkout attempts. Please wait a minute and try again.',
        429
      );
    }
    const checkout = validateCheckout(await readJson(request));
    const clientHash = await sha256(`checkout-client:${checkoutClientToken}`);
    const networkHash = await sha256(
      `checkout-network:${hashSecret}:${clientAddress}`
    );
    return json(
      await startCheckout(env, checkout, clientHash, networkHash),
      201
    );
  }
  if (request.method === 'POST' && url.pathname === '/api/webhooks/stripe') {
    return handleStripeWebhook(env, request);
  }
  const cancelMatch = /^\/api\/orders\/([0-9a-f-]{36})\/cancel$/iu.exec(
    url.pathname
  );
  if (request.method === 'POST' && cancelMatch?.[1]) {
    if (!hasAllowedOrigin(request, env.STOREFRONT_ORIGINS)) {
      return apiError(
        'forbidden',
        'Cross-site cancellation requests are blocked.',
        403
      );
    }
    const order = await cancelOrder(
      env,
      cancelMatch[1],
      request.headers.get('X-Order-Token') ?? ''
    );
    return order
      ? json(order)
      : apiError('order_not_found', 'The order could not be found.', 404);
  }
  const orderMatch = /^\/api\/orders\/([0-9a-f-]{36})$/iu.exec(url.pathname);
  if (request.method === 'GET' && orderMatch?.[1]) {
    const order = await loadOrder(
      env,
      orderMatch[1],
      request.headers.get('X-Order-Token') ?? ''
    );
    return order
      ? json(order)
      : apiError('order_not_found', 'The order could not be found.', 404);
  }
  return apiError('not_found', 'The API route was not found.', 404);
}

export async function fetchHandler(request: Request, env: Env) {
  if (
    request.method === 'OPTIONS' &&
    new URL(request.url).pathname.startsWith('/api/')
  ) {
    return corsPreflight(request, env.STOREFRONT_ORIGINS);
  }
  let response: Response;
  try {
    response = await route(request, env);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      const message =
        error.code === 'request_too_large'
          ? 'The checkout request is too large.'
          : 'The request body must be valid JSON.';
      response = apiError(error.code, message, 400);
    } else if (error instanceof CheckoutValidationError) {
      response = apiError(error.code, error.message, 400);
    } else if (error instanceof CheckoutCreationError) {
      response = apiError(error.code, error.message, error.status);
    } else if (error instanceof OrderCancellationError) {
      response = apiError(error.code, error.message, error.status);
    } else {
      console.error('Unhandled store API error:', error);
      response = apiError(
        'internal_error',
        'The store could not complete the request.',
        500
      );
    }
  }
  return withCors(request, env.STOREFRONT_ORIGINS, response);
}

export default {
  fetch(request: Request, env: Env, _context: ExecutionContextLike) {
    return fetchHandler(request, env);
  },
  scheduled(
    controller: ScheduledControllerLike,
    env: Env,
    context: ExecutionContextLike
  ) {
    context.waitUntil(cleanupExpiredOrders(env, controller.scheduledTime));
  },
};
