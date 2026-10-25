'use client';

import { useRef, useState } from 'react';
import { Check, Loader2, ScanLine, TriangleAlert } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { useAiStatus } from '@/hooks/useAiStatus';
import { PROVIDER_LABEL } from '@/components/ai/labels';
import type { ExtractKind, ExtractResponse, ExtractedFields } from '@/types/ai';

const KINDS: { value: ExtractKind; label: string }[] = [
  { value: 'RC', label: 'Registration certificate (RC)' },
  { value: 'INSURANCE', label: 'Insurance certificate' },
  { value: 'PUC', label: 'PUC certificate' },
  { value: 'FITNESS', label: 'Fitness certificate' }
];

const FIELD_LABEL: Record<keyof ExtractedFields, string> = {
  registrationNumber: 'Registration number',
  chassisNumber: 'Chassis number',
  engineNumber: 'Engine number',
  makeModel: 'Make and model',
  year: 'Year',
  fuelType: 'Fuel',
  color: 'Colour',
  seating: 'Seating',
  expiryDate: 'Expiry date',
  ownerName: 'Owner on document'
};

/**
 * Reads a photo of a document and fills the registration form with SUGGESTED values. A person must review every
 * field: this stores nothing and never marks ownership or eligibility.
 */
export function DocumentScanPanel({ onApply }: { onApply: (fields: ExtractedFields, kind: ExtractKind) => void }) {
  const status = useAiStatus();
  const [kind, setKind] = useState<ExtractKind>('RC');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!status.ready || !status.enabled || !status.anyConfigured || !status.features.extractDocument) return null;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG or WebP photo of the document.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('That photo is larger than 8 MB. Use a smaller one.');
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', kind);
      const res = await api.postForm<ExtractResponse>('/api/ai/extract-document', form);
      setResult(res);
      onApply(res.fields, kind);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not read this document right now.');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const filled = result ? (Object.keys(result.fields) as (keyof ExtractedFields)[]).filter((k) => result.fields[k] !== null) : [];

  return (
    <div className="ai-polish-hud" style={{ marginBottom: 14 }}>
      <div className="ai-polish-hud__header">
        <span className="ai-polish-hud__title">
          <ScanLine size={13} /> Fill from a document photo
          {result?.provider ? <span className="ai-polish-badge">{PROVIDER_LABEL[result.provider]}</span> : null}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <select className="input" style={{ maxWidth: 260 }} value={kind} onChange={(e) => setKind(e.target.value as ExtractKind)} aria-label="Document type" disabled={loading}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        <button type="button" className="button button--secondary" onClick={() => fileRef.current?.click()} disabled={loading}>
          {loading ? <Loader2 size={14} className="spin" /> : <ScanLine size={14} />}
          <span>{loading ? 'Reading document...' : 'Choose photo'}</span>
        </button>
      </div>
      <p className="text-muted" style={{ fontSize: '0.74rem', margin: '6px 0 0' }}>The photo is read once and not stored. AI can misread: verify every filled field against the document.</p>

      {error ? (
        <p role="alert" style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--color-danger)' }}>
          {error}
        </p>
      ) : null}

      {result ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, color: filled.length ? 'var(--color-success)' : 'var(--color-warning)' }}>
            {filled.length ? <Check size={14} /> : <TriangleAlert size={14} />}
            {filled.length ? `${filled.length} field${filled.length === 1 ? '' : 's'} suggested. Please verify them below.` : 'Nothing readable was found. Try a clearer, well-lit photo.'}
          </p>
          {filled.length ? (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
              {filled.map((k) => (
                <li key={k}>
                  {FIELD_LABEL[k]}: <strong className="mono">{String(result.fields[k])}</strong>
                  {result.confidence[k] ? <span style={{ marginLeft: 6, color: result.confidence[k] === 'low' ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>({result.confidence[k]} confidence)</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {result.notes ? <p className="text-muted" style={{ fontSize: '0.76rem', margin: '6px 0 0' }}>{result.notes}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
