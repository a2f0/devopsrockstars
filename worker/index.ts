import {loadCatalog} from './catalog';
import {CheckoutCreationError, startCheckout} from './checkout';
import {cleanupExpiredOrders} from './cleanup';
import {
  apiError,
  hasSameOrigin,
  json,
  RequestBodyError,
  readJson,
} from './http';
import {loadOrder} from './orders';
import type {Env, ExecutionContextLike, ScheduledControllerLike} from './types';
import {CheckoutValidationError, validateCheckout} from './validation';
import {handleStripeWebhook} from './webhook';

async function route(request: Request, env: Env) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/storefront') {
    return json(await loadCatalog(env));
  }
  if (request.method === 'POST' && url.pathname === '/api/checkouts') {
    if (!hasSameOrigin(request)) {
      return apiError(
        'forbidden',
        'Cross-site checkout requests are blocked.',
        403
      );
    }
    const checkout = validateCheckout(await readJson(request));
    return json(await startCheckout(env, checkout), 201);
  }
  if (request.method === 'POST' && url.pathname === '/api/webhooks/stripe') {
    return handleStripeWebhook(env, request);
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

async function fetchHandler(request: Request, env: Env) {
  try {
    return await route(request, env);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      const message =
        error.code === 'request_too_large'
          ? 'The checkout request is too large.'
          : 'The request body must be valid JSON.';
      return apiError(error.code, message, 400);
    }
    if (error instanceof CheckoutValidationError) {
      return apiError(error.code, error.message, 400);
    }
    if (error instanceof CheckoutCreationError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error('Unhandled store API error:', error);
    return apiError(
      'internal_error',
      'The store could not complete the request.',
      500
    );
  }
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
