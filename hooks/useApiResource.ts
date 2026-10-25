'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';

export interface ApiResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  code: string | null;
  refetch: () => void;
  setData: (data: T | null) => void;
}

/**
 * GET a resource with loading / error / refetch. `url` of null disables fetching.
 * Guards against races by tracking a request sequence number.
 */
export function useApiResource<T>(url: string | null): ApiResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const seqRef = useRef(0);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    setCode(null);
    api
      .get<T>(url)
      .then((result) => {
        if (seq !== seqRef.current) return;
        setData(result);
      })
      .catch((err) => {
        if (seq !== seqRef.current) return;
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : 'Request failed.');
        setCode(err instanceof ApiError ? err.code ?? String(err.status) : null);
      })
      .finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });
  }, [url, nonce]);

  return { data, loading, error, code, refetch, setData };
}
