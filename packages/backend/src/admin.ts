import {
  type AdminAlert,
  type AdminAlertsResponse,
  type AdminInventoryResponse,
  type AdminOrder,
  type AdminOrderFilter,
  type AdminOrdersResponse,
  type AdminProduct,
  type AdminVariant,
  adminOrderFilters,
  type StoreOrderStatus,
} from '@devopsrockstars/shared-types';
import {type AdminSession, AuthConfigurationError, createAuth} from './auth';
import {apiError, configuredOrigins, json, readBody} from './http';
import type {Env} from './types';

// Only these Better Auth endpoints are reachable. Sign-up, password reset,
// and every other built-in route stay unrouted even if the library enables them.
const AUTH_ROUTES = new Map([
  ['/api/auth/sign-in/email', 'POST'],
  ['/api/auth/get-session', 'GET'],
  ['/api/auth/sign-out', 'POST'],
  ['/api/auth/change-password', 'POST'],
]);

const ORDER_PAGE_SIZE = 25;
const MAX_INVENTORY = 100_000;
const MAX_UNIT_AMOUNT = 99_999_999;
const ORDER_STATUSES: readonly StoreOrderStatus[] = [
  'creating_payment',
  'awaiting_payment',
  'paid',
  'canceled',
];
const VARIANT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const ORDER_CURSOR =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([0-9a-f-]{36})$/u;

function privateJson(value: unknown, status = 200) {
  return withPrivateHeaders(json(value, status));
}

function privateError(code: string, message: string, status: number) {
  return withPrivateHeaders(apiError(code, message, status));
}

function withPrivateHeaders(response: Response) {
  const secured = new Response(response.body, response);
  secured.headers.set('Cache-Control', 'private, no-store');
  secured.headers.set('Referrer-Policy', 'no-referrer');
  return secured;
}

function methodNotAllowed(allowed: string) {
  const response = privateError(
    'method_not_allowed',
    'The request method is not allowed.',
    405
  );
  response.headers.set('Allow', allowed);
  return response;
}

// SameSite=Lax already withholds the cookie from cross-site POSTs; this also
// rejects other same-site hosts and requests that omit Origin.
function trustedMutation(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  if (
    origin === null ||
    (origin !== new URL(request.url).origin &&
      !configuredOrigins(env.STOREFRONT_ORIGINS).has(origin))
  ) {
    return privateError('forbidden', 'Cross-site requests are blocked.', 403);
  }
  if (
    request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/json'
  ) {
    return privateError(
      'unsupported_media_type',
      'Send the request body as JSON.',
      415
    );
  }
  return null;
}

async function readObject(request: Request) {
  try {
    const body = JSON.parse(await readBody(request, 8192)) as unknown;
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const invalidRequest = () =>
  privateError('invalid_request', 'The request is invalid.', 400);
const authUnavailable = () =>
  privateError(
    'auth_unavailable',
    'Administrator sign-in is temporarily unavailable.',
    503
  );

async function handleAuth(request: Request, env: Env, url: URL) {
  const method = AUTH_ROUTES.get(url.pathname);
  if (!method)
    return privateError('not_found', 'The API route was not found.', 404);
  if (request.method !== method) return methodNotAllowed(method);
  let authRequest = request;
  if (method === 'POST') {
    const rejected = trustedMutation(request, env);
    if (rejected) return rejected;
    const body = await readObject(request);
    if (!body) return invalidRequest();
    const headers = new Headers(request.headers);
    headers.delete('Content-Length');
    authRequest = new Request(request, {
      headers,
      body: JSON.stringify({
        ...body,
        // A changed password always signs out every other session.
        ...(url.pathname.endsWith('/change-password')
          ? {revokeOtherSessions: true}
          : {}),
      }),
    });
  }
  try {
    return withPrivateHeaders(
      await createAuth(env, url.origin).handler(authRequest)
    );
  } catch (error) {
    if (!(error instanceof AuthConfigurationError))
      console.error('Administrator authentication failed:', error);
    return authUnavailable();
  }
}

async function adminSession(
  request: Request,
  env: Env,
  origin: string
): Promise<AdminSession | Response> {
  try {
    const session = await createAuth(env, origin).api.getSession({
      headers: request.headers,
      query: {disableCookieCache: true, disableRefresh: true},
    });
    return (
      session ??
      privateError(
        'authentication_required',
        'Sign in to use the store admin.',
        401
      )
    );
  } catch (error) {
    if (!(error instanceof AuthConfigurationError))
      console.error('Administrator session check failed:', error);
    return authUnavailable();
  }
}

interface InventoryRow {
  readonly product_id: string;
  readonly slug: string;
  readonly product_name: string;
  readonly manufacturer: string;
  readonly product_active: number;
  readonly variant_id: string;
  readonly sku: string;
  readonly label: string;
  readonly unit_amount: number;
  readonly currency: string;
  readonly inventory_quantity: number;
  readonly variant_active: number;
  readonly updated_at: string;
  readonly reserved_quantity: number;
  readonly sold_quantity: number;
}

async function loadAdminInventory(env: Env): Promise<AdminInventoryResponse> {
  const result = await env.DB.prepare(
    `SELECT
       p.id AS product_id,
       p.slug,
       p.name AS product_name,
       p.manufacturer,
       p.active AS product_active,
       v.id AS variant_id,
       v.sku,
       v.label,
       v.unit_amount,
       v.currency,
       v.inventory_quantity,
       v.active AS variant_active,
       v.updated_at,
       COALESCE((
         SELECT SUM(oi.quantity)
         FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id
         WHERE oi.variant_id = v.id
           AND o.status IN ('creating_payment', 'awaiting_payment')
       ), 0) AS reserved_quantity,
       COALESCE((
         SELECT SUM(oi.quantity)
         FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id
         WHERE oi.variant_id = v.id AND o.status = 'paid'
       ), 0) AS sold_quantity
     FROM products p
     INNER JOIN product_variants v ON v.product_id = p.id
     ORDER BY p.sort_order, p.id, v.sort_order, v.id`
  ).all<InventoryRow>();
  const products = new Map<
    string,
    Omit<AdminProduct, 'variants'> & {variants: AdminVariant[]}
  >();
  for (const row of result.results) {
    let product = products.get(row.product_id);
    if (!product) {
      product = {
        id: row.product_id,
        slug: row.slug,
        name: row.product_name,
        manufacturer: row.manufacturer,
        active: row.product_active === 1,
        variants: [],
      };
      products.set(row.product_id, product);
    }
    product.variants.push({
      id: row.variant_id,
      sku: row.sku,
      label: row.label,
      unitAmount: row.unit_amount,
      currency: row.currency,
      inventoryQuantity: row.inventory_quantity,
      reservedQuantity: row.reserved_quantity,
      soldQuantity: row.sold_quantity,
      active: row.variant_active === 1,
      updatedAt: row.updated_at,
    });
  }
  return {products: [...products.values()]};
}

function wholeNumber(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

export function validateVariantUpdate(body: Record<string, unknown>) {
  const allowed = [
    'expectedInventoryQuantity',
    'inventoryQuantity',
    'unitAmount',
    'active',
  ];
  if (Object.keys(body).some(key => !allowed.includes(key))) return null;
  const {expectedInventoryQuantity, inventoryQuantity, unitAmount, active} =
    body;
  if (
    inventoryQuantity === undefined &&
    unitAmount === undefined &&
    active === undefined
  )
    return null;
  if (
    (inventoryQuantity !== undefined ||
      expectedInventoryQuantity !== undefined) &&
    !(
      wholeNumber(inventoryQuantity, 0, MAX_INVENTORY) &&
      wholeNumber(expectedInventoryQuantity, 0, Number.MAX_SAFE_INTEGER)
    )
  )
    return null;
  if (unitAmount !== undefined && !wholeNumber(unitAmount, 50, MAX_UNIT_AMOUNT))
    return null;
  if (active !== undefined && typeof active !== 'boolean') return null;
  return {
    ...(inventoryQuantity === undefined
      ? {}
      : {
          inventoryQuantity: inventoryQuantity as number,
          expectedInventoryQuantity: expectedInventoryQuantity as number,
        }),
    ...(unitAmount === undefined ? {} : {unitAmount: unitAmount as number}),
    ...(active === undefined ? {} : {active: active as boolean}),
  };
}

async function updateVariant(
  env: Env,
  id: string,
  body: Record<string, unknown>,
  session: AdminSession
) {
  const update = validateVariantUpdate(body);
  if (!update) return invalidRequest();
  const now = new Date().toISOString();
  const assignments: string[] = [];
  const values: unknown[] = [];
  if (update.inventoryQuantity !== undefined) {
    assignments.push('inventory_quantity = ?');
    values.push(update.inventoryQuantity);
  }
  if (update.unitAmount !== undefined) {
    assignments.push('unit_amount = ?');
    values.push(update.unitAmount);
  }
  if (update.active !== undefined) {
    assignments.push('active = ?');
    values.push(update.active ? 1 : 0);
  }
  assignments.push('updated_at = ?');
  values.push(now, id);
  let condition = 'id = ?';
  if (update.expectedInventoryQuantity !== undefined) {
    condition += ' AND inventory_quantity = ?';
    values.push(update.expectedInventoryQuantity);
  }
  const result = await env.DB.prepare(
    `UPDATE product_variants SET ${assignments.join(', ')} WHERE ${condition}`
  )
    .bind(...values)
    .run();
  if (!result.meta.changes) {
    const current = await env.DB.prepare(
      'SELECT inventory_quantity FROM product_variants WHERE id = ?'
    )
      .bind(id)
      .first<{inventory_quantity: number}>();
    return current
      ? privateError(
          'inventory_changed',
          'Stock changed since the page loaded, possibly from a checkout. Review the current quantity and try again.',
          409
        )
      : privateError('variant_not_found', 'The variant was not found.', 404);
  }
  console.log(
    JSON.stringify({
      event: 'admin.variant_updated',
      admin: session.user.email,
      variantId: id,
      ...update,
    })
  );
  return privateJson(await loadAdminInventory(env));
}

async function updateProduct(
  env: Env,
  id: string,
  body: Record<string, unknown>,
  session: AdminSession
) {
  if (Object.keys(body).length !== 1 || typeof body['active'] !== 'boolean')
    return invalidRequest();
  const result = await env.DB.prepare(
    'UPDATE products SET active = ?, updated_at = ? WHERE id = ?'
  )
    .bind(body['active'] ? 1 : 0, new Date().toISOString(), id)
    .run();
  if (!result.meta.changes)
    return privateError('product_not_found', 'The product was not found.', 404);
  console.log(
    JSON.stringify({
      event: 'admin.product_updated',
      admin: session.user.email,
      productId: id,
      active: body['active'],
    })
  );
  return privateJson(await loadAdminInventory(env));
}

interface OrderRow {
  readonly id: string;
  readonly status: StoreOrderStatus;
  readonly currency: string;
  readonly subtotal_amount: number;
  readonly shipping_amount: number;
  readonly total_amount: number;
  readonly email: string;
  readonly shipping_name: string;
  readonly shipping_address_line1: string;
  readonly shipping_address_line2: string;
  readonly shipping_city: string;
  readonly shipping_state: string;
  readonly shipping_postal_code: string;
  readonly shipping_country: string;
  readonly stripe_payment_intent_id: string | null;
  readonly reservation_expires_at: string;
  readonly created_at: string;
  readonly paid_at: string | null;
  readonly canceled_at: string | null;
}

interface OrderItemRow {
  readonly order_id: string;
  readonly sku: string;
  readonly product_name: string;
  readonly variant_label: string;
  readonly unit_amount: number;
  readonly quantity: number;
  readonly line_total: number;
}

async function loadAdminOrders(
  env: Env,
  filter: AdminOrderFilter,
  cursor: {createdAt: string; id: string} | null
): Promise<AdminOrdersResponse> {
  const page = await env.DB.prepare(
    `SELECT
       id, status, currency, subtotal_amount, shipping_amount, total_amount,
       email, shipping_name, shipping_address_line1, shipping_address_line2,
       shipping_city, shipping_state, shipping_postal_code, shipping_country,
       stripe_payment_intent_id, reservation_expires_at, created_at, paid_at,
       canceled_at
     FROM orders
     WHERE (? = 'all' OR status = ?)
       AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  )
    .bind(
      filter,
      filter,
      cursor?.createdAt ?? null,
      cursor?.createdAt ?? null,
      cursor?.createdAt ?? null,
      cursor?.id ?? null,
      ORDER_PAGE_SIZE + 1
    )
    .all<OrderRow>();
  const rows = page.results.slice(0, ORDER_PAGE_SIZE);
  const items = new Map<string, OrderItemRow[]>();
  if (rows.length) {
    const lines = await env.DB.prepare(
      `SELECT order_id, sku, product_name, variant_label, unit_amount, quantity,
         line_total
       FROM order_items
       WHERE order_id IN (${rows.map(() => '?').join(', ')})
       ORDER BY product_name, variant_label`
    )
      .bind(...rows.map(row => row.id))
      .all<OrderItemRow>();
    for (const line of lines.results)
      items.set(line.order_id, [...(items.get(line.order_id) ?? []), line]);
  }
  const counted = await env.DB.prepare(
    'SELECT status, COUNT(*) AS count FROM orders GROUP BY status'
  ).all<{status: StoreOrderStatus; count: number}>();
  const counts = Object.fromEntries(
    ORDER_STATUSES.map(status => [
      status,
      counted.results.find(row => row.status === status)?.count ?? 0,
    ])
  ) as Record<StoreOrderStatus, number>;
  const last = rows.at(-1);
  return {
    orders: rows.map(
      (row): AdminOrder => ({
        id: row.id,
        status: row.status,
        currency: row.currency,
        subtotalAmount: row.subtotal_amount,
        shippingAmount: row.shipping_amount,
        totalAmount: row.total_amount,
        email: row.email,
        shipping: {
          name: row.shipping_name,
          addressLine1: row.shipping_address_line1,
          addressLine2: row.shipping_address_line2,
          city: row.shipping_city,
          state: row.shipping_state,
          postalCode: row.shipping_postal_code,
          country: row.shipping_country,
        },
        stripePaymentIntentId: row.stripe_payment_intent_id,
        reservationExpiresAt: row.reservation_expires_at,
        createdAt: row.created_at,
        paidAt: row.paid_at,
        canceledAt: row.canceled_at,
        items: (items.get(row.id) ?? []).map(line => ({
          sku: line.sku,
          productName: line.product_name,
          variantLabel: line.variant_label,
          unitAmount: line.unit_amount,
          quantity: line.quantity,
          lineTotal: line.line_total,
        })),
      })
    ),
    counts,
    nextCursor:
      page.results.length > ORDER_PAGE_SIZE && last
        ? `${last.created_at}|${last.id}`
        : null,
  };
}

interface AlertRow {
  readonly event_id: string;
  readonly reason: string;
  readonly action: AdminAlert['action'];
  readonly status: AdminAlert['status'];
  readonly order_id: string;
  readonly payment_intent_id: string;
  readonly amount_received: number | null;
  readonly currency: string | null;
  readonly created_at: string;
  readonly resolved_at: string | null;
}

async function loadAdminAlerts(
  env: Env,
  status: 'open' | 'resolved' | 'all'
): Promise<AdminAlertsResponse> {
  const result = await env.DB.prepare(
    `SELECT event_id, reason, action, status, order_id, payment_intent_id,
       amount_received, currency, created_at, resolved_at
     FROM stripe_event_alerts
     WHERE (? = 'all' OR status = ?)
     ORDER BY created_at DESC, event_id
     LIMIT 100`
  )
    .bind(status, status)
    .all<AlertRow>();
  return {
    alerts: result.results.map(row => ({
      eventId: row.event_id,
      reason: row.reason,
      action: row.action,
      status: row.status,
      orderId: row.order_id,
      paymentIntentId: row.payment_intent_id,
      amountReceived: row.amount_received,
      currency: row.currency,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    })),
  };
}

async function resolveAlert(env: Env, eventId: string, session: AdminSession) {
  const result = await env.DB.prepare(
    `UPDATE stripe_event_alerts
     SET status = 'resolved', resolved_at = ?
     WHERE event_id = ? AND status = 'open'`
  )
    .bind(new Date().toISOString(), eventId)
    .run();
  if (!result.meta.changes)
    return privateError(
      'alert_not_found',
      'The open alert was not found.',
      404
    );
  console.log(
    JSON.stringify({
      event: 'admin.alert_resolved',
      admin: session.user.email,
      alertId: eventId,
    })
  );
  return privateJson(await loadAdminAlerts(env, 'open'));
}

type AdminRoute =
  | {method: 'GET'; run: (env: Env) => Promise<Response>}
  | {
      method: 'POST';
      run: (
        env: Env,
        body: Record<string, unknown>,
        session: AdminSession
      ) => Promise<Response>;
    };

function decodedSegment(value: string | undefined) {
  try {
    return value === undefined ? null : decodeURIComponent(value);
  } catch {
    return null;
  }
}

function adminRoute(url: URL): AdminRoute | Response | null {
  const path = url.pathname;
  if (path === '/api/admin/inventory')
    return {
      method: 'GET',
      run: async env => privateJson(await loadAdminInventory(env)),
    };
  if (path === '/api/admin/orders') {
    const filter = url.searchParams.get('status') ?? 'all';
    const cursorText = url.searchParams.get('cursor');
    const cursor = cursorText === null ? null : ORDER_CURSOR.exec(cursorText);
    if (
      !adminOrderFilters.includes(filter as AdminOrderFilter) ||
      (cursorText !== null && !cursor)
    )
      return invalidRequest();
    return {
      method: 'GET',
      run: async env =>
        privateJson(
          await loadAdminOrders(
            env,
            filter as AdminOrderFilter,
            cursor?.[1] && cursor[2]
              ? {createdAt: cursor[1], id: cursor[2]}
              : null
          )
        ),
    };
  }
  if (path === '/api/admin/alerts') {
    const status = url.searchParams.get('status') ?? 'open';
    if (!['open', 'resolved', 'all'].includes(status)) return invalidRequest();
    return {
      method: 'GET',
      run: async env =>
        privateJson(
          await loadAdminAlerts(env, status as 'open' | 'resolved' | 'all')
        ),
    };
  }
  const variant = /^\/api\/admin\/variants\/([^/]+)$/u.exec(path);
  if (variant) {
    const id = decodedSegment(variant[1]);
    if (!id || !VARIANT_ID.test(id)) return invalidRequest();
    return {
      method: 'POST',
      run: (env, body, session) => updateVariant(env, id, body, session),
    };
  }
  const product = /^\/api\/admin\/products\/([^/]+)$/u.exec(path);
  if (product) {
    const id = decodedSegment(product[1]);
    if (!id || !VARIANT_ID.test(id)) return invalidRequest();
    return {
      method: 'POST',
      run: (env, body, session) => updateProduct(env, id, body, session),
    };
  }
  const alert = /^\/api\/admin\/alerts\/([^/]+)\/resolve$/u.exec(path);
  if (alert) {
    const id = decodedSegment(alert[1]);
    if (!id || !/^[\w:.-]{1,255}$/u.test(id)) return invalidRequest();
    return {
      method: 'POST',
      run: async (env, _body, session) => resolveAlert(env, id, session),
    };
  }
  return null;
}

export async function handleAdmin(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/auth/'))
    return handleAuth(request, env, url);
  const route = adminRoute(url);
  if (!route)
    return privateError('not_found', 'The API route was not found.', 404);
  if (route instanceof Response) return route;
  if (request.method !== route.method) return methodNotAllowed(route.method);
  let body: Record<string, unknown> = {};
  if (route.method === 'POST') {
    const rejected = trustedMutation(request, env);
    if (rejected) return rejected;
    const parsed = await readObject(request);
    if (!parsed) return invalidRequest();
    body = parsed;
  }
  const session = await adminSession(request, env, url.origin);
  if (session instanceof Response) return session;
  return route.method === 'GET'
    ? route.run(env)
    : route.run(env, body, session);
}
