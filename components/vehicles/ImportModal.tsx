'use client';

import { useMemo, useRef, useState } from 'react';
import { Download, UploadCloud, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Select } from '@/components/ui/Select';
import { api, ApiError } from '@/lib/client/api';
import { useToast } from '@/lib/client/useToast';
import { parseCsv, toCsv, downloadCsv } from '@/lib/fleet/csv';
import type { VehicleInput } from '@/types';

const TARGET_FIELDS: { key: keyof VehicleInput; label: string; required?: boolean }[] = [
  { key: 'registrationNumber', label: 'Registration number', required: true },
  { key: 'displayName', label: 'Display name', required: true },
  { key: 'sector', label: 'Sector', required: true },
  { key: 'vehicleClass', label: 'Class', required: true },
  { key: 'vehicleType', label: 'Vehicle type', required: true },
  { key: 'claimedOwnership', label: 'Claimed ownership' },
  { key: 'managingUnit', label: 'Managing unit' },
  { key: 'driverName', label: 'Driver name' },
  { key: 'driverPhone', label: 'Driver phone' },
  { key: 'makeModel', label: 'Make & model' },
  { key: 'year', label: 'Year' },
  { key: 'fuelType', label: 'Fuel type' },
  { key: 'seating', label: 'Seating' },
  { key: 'chassisNumber', label: 'Chassis number' },
  { key: 'engineNumber', label: 'Engine number' },
  { key: 'odometerKm', label: 'Odometer km' },
  { key: 'pucExpiry', label: 'PUC expiry' },
  { key: 'insuranceExpiry', label: 'Insurance expiry' },
  { key: 'fitnessExpiry', label: 'Fitness expiry' }
];

const SECTORS = ['GMC_WASTE', 'AMBULANCE_108', 'POLICE_PATROL', 'PWD_HEAVY', 'HEALTH_VAN', 'ELECTION_REQUISITION'];
const CLASSES = ['PATROL_CAR', 'MOTORCYCLE', 'VAN', 'HEAVY'];
const OWNERSHIP = ['GOVERNMENT_FLEET', 'SEIZED_IMPOUNDED', 'OTHER_UNVERIFIED'];
const REG_REGEX = /^[A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{0,3}[\s-]?\d{1,4}$/i;

function autoDetect(headers: string[], field: string): string {
  const norm = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const target = norm(field);
  // direct match
  const exact = headers.find((h) => norm(h) === target);
  if (exact) return exact;
  // fuzzy contains
  const partial = headers.find((h) => norm(h).includes(target) || target.includes(norm(h)));
  return partial ?? '';
}

interface ParsedResult {
  headers: string[];
  rows: Record<string, string>[];
}

type RowStatus = 'valid' | 'invalid' | 'duplicate';
interface ValidatedRow {
  input: Partial<VehicleInput>;
  status: RowStatus;
  errors: string[];
}

export function ImportModal({
  onClose,
  onImported
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const { toast } = useToast();
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ count: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const sample: Record<string, string> = {
      [TARGET_FIELDS[0].label]: 'MP07-AB-1234',
      [TARGET_FIELDS[1].label]: 'Patrol vehicle - Thatipur',
      [TARGET_FIELDS[2].label]: 'POLICE_PATROL',
      [TARGET_FIELDS[3].label]: 'PATROL_CAR',
      [TARGET_FIELDS[4].label]: 'SUV',
      [TARGET_FIELDS[5].label]: 'OTHER_UNVERIFIED'
    };
    for (const f of TARGET_FIELDS) if (!(f.label in sample)) sample[f.label] = '';
    const columns = TARGET_FIELDS.map((f) => ({ key: f.label, header: f.label }));
    const csv = toCsv([sample], columns);
    downloadCsv('sanchay-vehicle-import-template.csv', csv);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const result = parseCsv(text) as unknown;
        // parseCsv may return {headers, rows} or string[][]. Normalize.
        let headers: string[] = [];
        let rows: Record<string, string>[] = [];
        if (Array.isArray(result)) {
          const arr = result as string[][];
          headers = arr[0] ?? [];
          rows = arr.slice(1).map((r) => {
            const o: Record<string, string> = {};
            headers.forEach((h, i) => (o[h] = r[i] ?? ''));
            return o;
          });
        } else if (result && typeof result === 'object') {
          const r = result as { headers?: string[]; rows?: Record<string, string>[] };
          headers = r.headers ?? [];
          rows = r.rows ?? [];
        }
        if (headers.length === 0) {
          toast('Could not read any columns from the file', 'danger');
          return;
        }
        const map: Record<string, string> = {};
        for (const f of TARGET_FIELDS) map[f.key] = autoDetect(headers, f.label);
        setParsed({ headers, rows });
        setMapping(map);
        setResult(null);
      } catch {
        toast('Failed to parse CSV file', 'danger');
      }
    };
    reader.readAsText(file);
  }

  const validated = useMemo<ValidatedRow[]>(() => {
    if (!parsed) return [];
    const seen = new Set<string>();
    return parsed.rows.map((row) => {
      const input: Partial<VehicleInput> = {};
      const errors: string[] = [];
      for (const f of TARGET_FIELDS) {
        const col = mapping[f.key];
        const raw = col ? (row[col] ?? '').trim() : '';
        if (raw) {
          if (f.key === 'year' || f.key === 'seating' || f.key === 'odometerKm') {
            (input as Record<string, unknown>)[f.key] = Number(raw);
          } else {
            (input as Record<string, unknown>)[f.key] = raw;
          }
        }
        if (f.required && !raw) errors.push(`${f.label} missing`);
      }
      const reg = (input.registrationNumber ?? '').toString();
      if (reg && !REG_REGEX.test(reg)) errors.push('Invalid registration format');
      if (input.sector && !SECTORS.includes(input.sector as string)) errors.push('Unknown sector');
      if (input.vehicleClass && !CLASSES.includes(input.vehicleClass as string)) errors.push('Unknown class');
            if (input.claimedOwnership && !OWNERSHIP.includes(input.claimedOwnership as string)) errors.push('Unknown ownership');

      let status: RowStatus = errors.length ? 'invalid' : 'valid';
      const key = reg.replace(/[\s-]/g, '').toLowerCase();
      if (status === 'valid' && key) {
        // Duplicate candidate within this file (the server also flags duplicates
        // against existing records — rows are never silently merged).
        if (seen.has(key)) status = 'duplicate';
        seen.add(key);
      }
      return { input, status, errors };
    });
  }, [parsed, mapping]);

  const counts = useMemo(() => {
    let valid = 0;
    let invalid = 0;
    let duplicate = 0;
    for (const r of validated) {
      if (r.status === 'valid') valid++;
      else if (r.status === 'duplicate') duplicate++;
      else invalid++;
    }
    return { valid, invalid, duplicate };
  }, [validated]);

  async function confirmImport() {
    const rows = validated.filter((r) => r.status === 'valid').map((r) => r.input as VehicleInput);
    if (rows.length === 0) {
      toast('No valid rows to import', 'warning');
      return;
    }
    setImporting(true);
    setProgress(10);
    try {
      // simulated progress while the single bulk request is in flight
      const timer = setInterval(() => setProgress((p) => Math.min(90, p + 15)), 250);
      const res = await api.post<{ count: number }>('/api/cloud/vehicles/bulk', { type: 'import', rows });
      clearInterval(timer);
      setProgress(100);
      setResult(res);
      toast(`Imported ${res.count} vehicle${res.count === 1 ? '' : 's'}`, 'success');
      onImported();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Import failed';
      toast(message, 'danger');
      setProgress(0);
    } finally {
      setImporting(false);
    }
  }

  const footer = (
    <div className="cluster" style={{ justifyContent: 'space-between', width: '100%' }}>
      <Button variant="ghost" onClick={onClose} disabled={importing}>
        {result ? 'Done' : 'Cancel'}
      </Button>
      {parsed && !result ? (
        <Button variant="primary" onClick={confirmImport} loading={importing} disabled={counts.valid === 0}>
          Import {counts.valid} valid
        </Button>
      ) : null}
    </div>
  );

  return (
    <Modal title="Import vehicles from CSV" size="large" onClose={onClose} footer={footer} closeDisabled={importing}>
      <div className="stack">
        <div className="cluster" style={{ justifyContent: 'space-between' }}>
          <p className="text-muted" style={{ margin: 0 }}>
            Upload a CSV. Columns are auto-matched; adjust the mapping if needed.
          </p>
          <Button variant="secondary" size="sm" icon={<Download size={15} />} onClick={downloadTemplate}>
            Download template
          </Button>
        </div>

        {!parsed && (
          <div
            className={`veh-dropzone ${dragging ? 'veh-dropzone--drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Upload CSV file"
          >
            <UploadCloud size={30} />
            <strong>Drop CSV here or click to browse</strong>
            <span>Registration, name, sector, class, type and department are required.</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        )}

        {parsed && !result && (
          <div className="stack">
            <div className="panel">
              <h4 style={{ margin: '0 0 0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FileText size={16} /> Column mapping
              </h4>
              <div className="grid-3">
                {TARGET_FIELDS.map((f) => (
                  <label key={f.key} className="field" style={{ fontSize: '0.82rem' }}>
                    <span>
                      {f.label}
                      {f.required ? ' *' : ''}
                    </span>
                    <Select
                      value={mapping[f.key] ?? ''}
                      onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                      options={[{ value: '', label: 'Not mapped' }, ...parsed.headers.map((h) => ({ value: h, label: h }))]}
                      ariaLabel={`Map ${f.label}`}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="veh-import-summary">
              <div className="veh-import-stat">
                <strong style={{ color: 'var(--success, #16a34a)' }}>{counts.valid}</strong>
                <span>Valid</span>
              </div>
              <div className="veh-import-stat">
                <strong style={{ color: 'var(--warning, #d97706)' }}>{counts.duplicate}</strong>
                <span>Duplicate</span>
              </div>
              <div className="veh-import-stat">
                <strong style={{ color: 'var(--danger, #dc2626)' }}>{counts.invalid}</strong>
                <span>Invalid</span>
              </div>
              <div className="veh-import-stat">
                <strong>{validated.length}</strong>
                <span>Total rows</span>
              </div>
            </div>

            {importing && <ProgressBar value={progress} tone="brand" />}

            <div className="table-wrap" style={{ maxHeight: 280, overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Registration</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {validated.slice(0, 100).map((r, i) => (
                    <tr key={i}>
                      <td className="text-muted">{i + 1}</td>
                      <td className="mono">{r.input.registrationNumber ?? '-'}</td>
                      <td>{r.input.displayName ?? '-'}</td>
                      <td>
                        {r.status === 'valid' && <Badge tone="success">Valid</Badge>}
                        {r.status === 'duplicate' && <Badge tone="warning">Duplicate candidate</Badge>}
                        {r.status === 'invalid' && <Badge tone="danger">Invalid</Badge>}
                      </td>
                      <td className="text-muted" style={{ fontSize: '0.78rem' }}>
                        {r.status === 'duplicate' ? 'Duplicate of an earlier row — flagged for review' : r.errors.join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validated.length > 100 && (
                <p className="text-muted" style={{ padding: '0.5rem' }}>
                  Showing first 100 of {validated.length} rows.
                </p>
              )}
            </div>
          </div>
        )}

        {result && (
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: '1rem 0' }}>
            <CheckCircle2 size={44} color="var(--success, #16a34a)" />
            <h3 style={{ margin: 0 }}>Import complete</h3>
            <p className="text-muted" style={{ margin: 0 }}>
              {result.count} vehicle{result.count === 1 ? '' : 's'} added to the fleet.
            </p>
            {(counts.invalid > 0 || counts.duplicate > 0) && (
              <p className="text-muted" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangle size={15} /> {counts.invalid} invalid and {counts.duplicate} duplicate rows were skipped.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
