'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Bot, Loader2, Send, Sparkles, X, ArrowRight, TriangleAlert, Info } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { useAiStatus } from '@/hooks/useAiStatus';
import { useFleet } from '@/lib/client/useFleet';
import { MarkdownView } from '@/components/shared/MarkdownView';
import { PROVIDER_LABEL } from '@/components/ai/labels';
import type { AiRouting, CopilotResponse, CopilotTurn } from '@/types/ai';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  meta?: Pick<CopilotResponse, 'provider' | 'model' | 'latencyMs' | 'degraded' | 'suggestedActions' | 'grounding'>;
  error?: boolean;
}

const HOOKS = [
  'Reading your fleet in scope...',
  'Checking eligibility, allocations and returns...',
  'Cross-checking compliance and telemetry freshness...',
  'Writing the answer from the data...'
];

const STARTERS = [
  'How many vehicles are eligible, and what is blocking the rest?',
  'Are there any overdue returns?',
  'What is waiting for my decision?',
  'Which vehicles have expired compliance documents?'
];

const GREETING =
  'Hello. I am Sanchay AI. I can explain what is happening across your fleet, using only the data you are allowed to see. I cannot approve requests or change any record: decisions stay with your team.';

export function AiCopilotModal() {
  const status = useAiStatus();
  const { me } = useFleet();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hook, setHook] = useState(0);
  const [routing, setRouting] = useState<AiRouting>('auto');
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', text: GREETING }]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  // Ctrl/Cmd + J (Ctrl+K belongs to the command palette)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      setHook(0);
      return;
    }
    const start = Date.now();
    const a = setInterval(() => setElapsed(Date.now() - start), 100);
    const b = setInterval(() => setHook((h) => (h + 1) % HOOKS.length), 1800);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [loading]);

  async function send(text?: string) {
    const question = (text ?? query).trim();
    if (!question || loading) return;
    const history: CopilotTurn[] = messages
      .filter((m) => !m.error)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.text }));
    setMessages((p) => [...p, { role: 'user', text: question }]);
    setQuery('');
    setLoading(true);
    try {
      const res = await api.post<CopilotResponse>('/api/ai/copilot', { question, history: history.slice(1), provider: routing });
      setMessages((p) => [
        ...p,
        {
          role: 'assistant',
          text: res.answer,
          meta: { provider: res.provider, model: res.model, latencyMs: res.latencyMs, degraded: res.degraded, suggestedActions: res.suggestedActions, grounding: res.grounding }
        }
      ]);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not reach the assistant. Check your connection and try again.';
      setMessages((p) => [...p, { role: 'assistant', text: message, error: true }]);
    } finally {
      setLoading(false);
    }
  }

  // Hide entirely when AI is off, not configured, or the user is not signed in.
  if (!me || !status.ready || !status.enabled || !status.anyConfigured || !status.features.copilot) return null;

  return (
    <>
      <div
        className="ai-copilot-btn-wrap"
        role="button"
        tabIndex={0}
        title="Ask Sanchay AI (Ctrl + J)"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <button type="button" className="ai-copilot-btn-inner" aria-label="Open Sanchay AI assistant" tabIndex={-1}>
          <Sparkles size={16} style={{ color: 'var(--color-brand)' }} />
          <span>Ask AI</span>
          <kbd style={{ fontSize: '0.68rem', padding: '2px 5px', borderRadius: 'var(--radius-sm, 4px)', background: 'var(--color-bg-primary)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', border: '1px solid var(--color-border)', marginLeft: 4, lineHeight: 1 }}>
            Ctrl J
          </kbd>
        </button>
      </div>

      {mounted && open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-copilot-title"
              className="copilot-modal-overlay"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div className="copilot-modal-card">
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-secondary)', flexShrink: 0, gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-primary)', color: 'var(--color-brand)', flexShrink: 0 }}>
                      <Bot size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div id="ai-copilot-title" style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        Sanchay AI
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Answers from your own fleet data. Read-only: it cannot approve or change anything.</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label className="sr-only" htmlFor="ai-routing">AI engine</label>
                    <select
                      id="ai-routing"
                      value={routing}
                      onChange={(e) => setRouting(e.target.value as AiRouting)}
                      style={{ fontSize: '0.74rem', padding: '5px 8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
                    >
                      <option value="auto">Auto (fastest first)</option>
                      {(Object.keys(PROVIDER_LABEL) as Exclude<AiRouting, 'auto'>[]).map((id) => (
                        <option key={id} value={id}>
                          {PROVIDER_LABEL[id]}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setOpen(false)} className="icon-button" aria-label="Close assistant">
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div ref={listRef} style={{ flex: '1 1 auto', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--color-bg-primary)', minHeight: 0 }}>
                  {messages.map((m, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: m.role === 'user' ? '80%' : '92%' }}>
                      <div
                        style={{
                          padding: m.role === 'user' ? '10px 14px' : '14px 18px',
                          borderRadius: 'var(--radius-md)',
                          background: m.role === 'user' ? 'var(--color-brand)' : m.error ? 'var(--color-danger-bg)' : 'var(--color-bg-secondary)',
                          color: m.role === 'user' ? '#fff' : 'var(--color-text-primary)',
                          fontSize: '0.84rem',
                          lineHeight: 1.6,
                          border: m.role === 'user' ? 'none' : `1px solid ${m.error ? 'var(--color-danger)' : 'var(--color-border)'}`
                        }}
                        role={m.error ? 'alert' : undefined}
                      >
                        {m.role === 'user' ? <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div> : <MarkdownView content={m.text} />}
                      </div>

                      {m.meta?.degraded ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, fontSize: '0.7rem', color: 'var(--color-warning)', paddingLeft: 4 }}>
                          <TriangleAlert size={11} />
                          <span>No AI engine answered. This is a plain data summary, not an AI answer.</span>
                        </div>
                      ) : m.meta?.provider ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, fontSize: '0.68rem', color: 'var(--color-text-muted)', paddingLeft: 4 }}>
                          <Sparkles size={11} style={{ color: 'var(--color-brand)' }} />
                          <span>
                            <strong>{PROVIDER_LABEL[m.meta.provider]}</strong> ({m.meta.model}) in {(m.meta.latencyMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                      ) : null}

                      {m.meta?.grounding?.length ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, fontSize: '0.68rem', color: 'var(--color-text-muted)', paddingLeft: 4 }}>
                          <Info size={11} />
                          <span>Based on: {m.meta.grounding.join(' · ')}</span>
                        </div>
                      ) : null}

                      {m.meta?.suggestedActions?.length ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {m.meta.suggestedActions.map((a) => (
                            <Link key={a.href} href={a.href} className="button button--secondary button--sm" onClick={() => setOpen(false)}>
                              <span>{a.label}</span>
                              <ArrowRight size={13} />
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {messages.length === 1 && !loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span className="text-muted" style={{ fontSize: '0.74rem' }}>Try asking</span>
                      {STARTERS.map((s) => (
                        <button key={s} type="button" className="button button--secondary button--sm" style={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', padding: '8px 12px', whiteSpace: 'normal' }} onClick={() => void send(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {loading ? (
                    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', maxWidth: '88%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-brand)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Sanchay AI is working</span>
                        <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', background: 'var(--color-bg-primary)', padding: '1px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>{(elapsed / 1000).toFixed(1)}s</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Loader2 size={16} className="spin" style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.84rem', color: 'var(--color-text-primary)', fontWeight: 500 }}>{HOOKS[hook]}</span>
                      </div>
                      <div style={{ height: 3, width: '100%', borderRadius: 2, background: 'var(--color-bg-primary)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(94, 15 + Math.round((1 - Math.exp(-elapsed / 4000)) * 79))}%`, background: 'var(--color-brand)', borderRadius: 2, transition: 'width 150ms ease' }} />
                      </div>
                    </div>
                  ) : null}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                  style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', display: 'flex', gap: 8, flexShrink: 0 }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask about eligibility, returns, approvals, compliance..."
                    aria-label="Question for Sanchay AI"
                    disabled={loading}
                    maxLength={1500}
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', fontSize: '0.84rem' }}
                  />
                  <button
                    type="submit"
                    disabled={loading || !query.trim()}
                    aria-label="Send question"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--color-brand)', border: 'none', color: '#fff', cursor: loading || !query.trim() ? 'not-allowed' : 'pointer', opacity: loading || !query.trim() ? 0.6 : 1, flexShrink: 0 }}
                  >
                    <Send size={15} />
                  </button>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
