import type {
  AdminAlertsResponse,
  AdminInventoryResponse,
  AdminOrderFilter,
  AdminOrdersResponse,
  AdminProductUpdateRequest,
  AdminVariantUpdateRequest,
  StoreErrorResponse,
} from '@devopsrockstars/shared-types';
import {storeApiOrigin} from '../environment';

export class AdminApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AdminApiError';
    this.code = code;
    this.status = status;
  }
}

export interface AdminUser {
  readonly email: string;
  readonly name: string;
}

// The session cookie belongs to the store API's host. The site and the API
// are the same site, so the browser sends it with credentialed requests.
function apiUrl(path: string) {
  return storeApiOrigin ? new URL(path, storeApiOrigin).href : path;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new AdminApiError(
      'network_error',
      'The store API could not be reached. Check your connection and try again.',
      0
    );
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Handled below with the response status.
  }
  if (!response.ok) {
    const error =
      typeof body === 'object' && body !== null
        ? (body as Partial<StoreErrorResponse> & {message?: string})
        : {};
    throw new AdminApiError(
      error.error?.code ?? 'request_failed',
      error.error?.message ?? error.message ?? 'The request failed.',
      response.status
    );
  }
  return body as T;
}

function post<T>(path: string, body: unknown) {
  return request<T>(path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

export async function loadSession(): Promise<AdminUser | null> {
  const session = await request<{user?: AdminUser} | null>(
    '/api/auth/get-session'
  );
  return session?.user ? session.user : null;
}

export function signIn(email: string, password: string) {
  return post<unknown>('/api/auth/sign-in/email', {email, password});
}

export function signOut() {
  return post<unknown>('/api/auth/sign-out', {});
}

export function changePassword(currentPassword: string, newPassword: string) {
  return post<unknown>('/api/auth/change-password', {
    currentPassword,
    newPassword,
    revokeOtherSessions: true,
  });
}

export function loadInventory() {
  return request<AdminInventoryResponse>('/api/admin/inventory');
}

export function updateVariant(id: string, update: AdminVariantUpdateRequest) {
  return post<AdminInventoryResponse>(
    `/api/admin/variants/${encodeURIComponent(id)}`,
    update
  );
}

export function updateProduct(id: string, update: AdminProductUpdateRequest) {
  return post<AdminInventoryResponse>(
    `/api/admin/products/${encodeURIComponent(id)}`,
    update
  );
}

export function loadOrders(filter: AdminOrderFilter, cursor?: string) {
  const query = new URLSearchParams({status: filter});
  if (cursor) query.set('cursor', cursor);
  return request<AdminOrdersResponse>(`/api/admin/orders?${query}`);
}

export function loadAlerts(status: 'open' | 'resolved') {
  return request<AdminAlertsResponse>(`/api/admin/alerts?status=${status}`);
}

export function resolveAlert(eventId: string) {
  return post<AdminAlertsResponse>(
    `/api/admin/alerts/${encodeURIComponent(eventId)}/resolve`,
    {}
  );
}
