import type { ApiResult } from '@/types';
import { trackCloudSync } from '@/lib/client/sync-status';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(url: string, init: RequestInit, track: boolean): Promise<T> {
  const run = (async () => {
    let response: Response;
    try {
      response = await fetch(url, { cache: 'no-store', ...init });
    } catch {
      throw new ApiError('Network error — could not reach the Sanchay server.', 0);
    }

    if (response.status === 401 && typeof window !== 'undefined') {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
      throw new ApiError('Your session has expired. Redirecting to sign in…', 401);
    }

    let body: ApiResult<T> | null = null;
    try {
      body = (await response.json()) as ApiResult<T>;
    } catch {
      body = null;
    }

    if (!response.ok || !body || body.success === false) {
      const message =
        body && body.success === false ? body.error : `Request failed (HTTP ${response.status}).`;
      const code = body && body.success === false ? body.code : undefined;
      throw new ApiError(message, response.status, code);
    }

    return body.data;
  })();

  return track ? trackCloudSync(run) : run;
}

interface PostOptions {
  /** Extra headers, e.g. { 'Idempotency-Key': '...' }. */
  headers?: Record<string, string>;
  /** Skip the cloud-sync status tracker (rarely needed). */
  track?: boolean;
}

export const api = {
  get<T>(url: string): Promise<T> {
    return request<T>(url, { method: 'GET' }, false);
  },
  post<T>(url: string, body?: unknown, options?: PostOptions): Promise<T> {
    return request<T>(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(options?.headers ?? {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      },
      options?.track ?? true
    );
  },
  /** Multipart upload (no JSON content-type; browser sets the boundary). */
  postForm<T>(url: string, form: FormData, options?: PostOptions): Promise<T> {
    return request<T>(
      url,
      { method: 'POST', headers: { ...(options?.headers ?? {}) }, body: form },
      options?.track ?? true
    );
  },
  put<T>(url: string, body?: unknown): Promise<T> {
    return request<T>(
      url,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      },
      true
    );
  }
};

/** Generate a stable idempotency key per submit attempt (spec 16). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
