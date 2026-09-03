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
  const maxBytes = 32_768;
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
