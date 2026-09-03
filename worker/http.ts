import type {StoreErrorResponse} from '../src/store/contracts';

const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {status, headers: JSON_HEADERS});
}

export function apiError(code: string, message: string, status: number) {
  return json({error: {code, message}} satisfies StoreErrorResponse, status);
}

export async function readBody(request: Request, maxBytes: number) {
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
  if (declaredLength > maxBytes) {
    throw new RequestBodyError('request_too_large');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError('invalid_json');
  const decoder = new TextDecoder();
  let body = '';
  let receivedBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError('request_too_large');
      }
      body += decoder.decode(chunk.value, {stream: true});
    }
    body += decoder.decode();
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError('invalid_json');
  } finally {
    reader.releaseLock();
  }
  return body;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return JSON.parse(await readBody(request, 32_768)) as unknown;
  } catch (error) {
    if (
      error instanceof RequestBodyError &&
      error.code === 'request_too_large'
    ) {
      throw error;
    }
    throw new RequestBodyError('invalid_json');
  }
}

function configuredOrigins(allowedOrigins?: string) {
  return new Set(
    allowedOrigins
      ?.split(',')
      .map(origin => origin.trim())
      .filter(Boolean) ?? []
  );
}

export function hasAllowedOrigin(request: Request, allowedOrigins?: string) {
  const origin = request.headers.get('Origin');
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  return (
    (origin === null && fetchSite !== 'cross-site') ||
    origin === new URL(request.url).origin ||
    (origin !== null && configuredOrigins(allowedOrigins).has(origin))
  );
}

export function withCors(
  request: Request,
  allowedOrigins: string | undefined,
  response: Response
) {
  const origin = request.headers.get('Origin');
  if (!origin || !configuredOrigins(allowedOrigins).has(origin)) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function corsPreflight(request: Request, allowedOrigins?: string) {
  if (!hasAllowedOrigin(request, allowedOrigins)) {
    return apiError('forbidden', 'Cross-site requests are blocked.', 403);
  }
  return withCors(
    request,
    allowedOrigins,
    new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Headers':
          'Content-Type, X-Checkout-Client, X-Order-Token',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
      },
    })
  );
}

export class RequestBodyError extends Error {
  readonly code: 'invalid_json' | 'request_too_large';

  constructor(code: RequestBodyError['code']) {
    super(code);
    this.name = 'RequestBodyError';
    this.code = code;
  }
}
