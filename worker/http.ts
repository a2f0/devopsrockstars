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

export async function readJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
  if (declaredLength > 32_768) {
    throw new RequestBodyError('request_too_large');
  }
  let body: string;
  try {
    body = await request.text();
  } catch {
    throw new RequestBodyError('invalid_json');
  }
  if (body.length > 32_768) {
    throw new RequestBodyError('request_too_large');
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new RequestBodyError('invalid_json');
  }
}

export function hasSameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  return (
    (origin === null || origin === new URL(request.url).origin) &&
    fetchSite !== 'cross-site'
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
