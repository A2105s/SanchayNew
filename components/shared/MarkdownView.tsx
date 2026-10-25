'use client';

import React from 'react';

interface MarkdownViewProps {
  content: string;
  fontSize?: string;
  lineHeight?: number | string;
  className?: string;
}

interface InlineToken {
  type: 'text' | 'bold' | 'italic' | 'code' | 'link';
  text: string;
  url?: string;
}

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'hr' }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'code_block'; lang: string; content: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'p'; text: string };

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let remaining = text;

  // Regex matching: `code`, **bold** / __bold__, *italic* / _italic_, [link](url)
  const regex = /(`([^`]+)`)|(\*\*([^*]+)\*\*|__([^_]+)__)|(\*([^*]+)\*|_([^_]+)_)|(\[([^\]]+)\]\(([^)]+)\))/;

  while (remaining) {
    const match = remaining.match(regex);
    if (!match || match.index === undefined) {
      tokens.push({ type: 'text', text: remaining });
      break;
    }

    const index = match.index;
    if (index > 0) {
      tokens.push({ type: 'text', text: remaining.slice(0, index) });
    }

    if (match[1]) {
      tokens.push({ type: 'code', text: match[2] });
    } else if (match[3]) {
      tokens.push({ type: 'bold', text: match[4] || match[5] });
    } else if (match[6]) {
      tokens.push({ type: 'italic', text: match[7] || match[8] });
    } else if (match[9]) {
      tokens.push({ type: 'link', text: match[10], url: match[11] });
    }

    remaining = remaining.slice(index + match[0].length);
  }

  return tokens;
}

function getSafeHref(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  // Explicitly disallow any javascript:, vbscript:, data:, file:, etc.
  if (/^(javascript|vbscript|data|file):/i.test(lower)) {
    return null;
  }

  // Allow standard web protocols
  if (lower.startsWith('https://') || lower.startsWith('http://') || lower.startsWith('mailto:')) {
    return trimmed;
  }

  // Allow relative internal paths starting with single '/'
  if (lower.startsWith('/') && !lower.startsWith('//') && !lower.startsWith('/\\')) {
    return trimmed;
  }

  return null;
}

function parseMarkdown(md: string): MarkdownBlock[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code_block', lang, content: codeLines.join('\n') });
      continue;
    }

    // Headings: #, ##, ###, ####, #####, ######
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim()
      });
      i++;
      continue;
    }

    // Horizontal Rule: ---, ***, ___
    if (/^(\s*[-*_]\s*){3,}$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Unordered List: *, -, +
    if (/^\s*[*+-]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[*+-]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[*+-]\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered List: 1., 2., etc.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemMatch = lines[i].match(/^\s*\d+\.\s+(.*)$/);
        if (!itemMatch) break;
        items.push(itemMatch[1]);
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Table
    if (line.includes('|') && lines[i + 1] && /^\s*\|?(\s*:?-+:?\s*\|)+\s*$/.test(lines[i + 1])) {
      const headers = line.split('|').map(s => s.trim()).filter(s => s.length > 0);
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        const row = lines[i].split('|').map(s => s.trim()).filter(s => s.length > 0);
        if (row.length > 0) rows.push(row);
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // Paragraph: collect consecutive lines
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].match(/^(#{1,6})\s+/) &&
      !lines[i].match(/^\s*[*+-]\s+/) &&
      !lines[i].match(/^\s*\d+\.\s+/) &&
      !/^(\s*[-*_]\s*){3,}$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'p', text: paraLines.join(' ') });
  }

  return blocks;
}

export function InlineText({ text }: { text: string }) {
  const tokens = parseInline(text);

  return (
    <>
      {tokens.map((token, idx) => {
        if (token.type === 'bold') {
          return (
            <strong key={idx} style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {token.text}
            </strong>
          );
        }
        if (token.type === 'italic') {
          return <em key={idx}>{token.text}</em>;
        }
        if (token.type === 'code') {
          return (
            <code
              key={idx}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                padding: '1px 5px',
                borderRadius: '3px',
                background: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-brand)'
              }}
            >
              {token.text}
            </code>
          );
        }
        if (token.type === 'link') {
          const safeHref = getSafeHref(token.url);
          if (!safeHref) {
            return (
              <span key={idx} style={{ color: 'var(--color-text-primary)' }}>
                {token.text}
              </span>
            );
          }
          return (
            <a
              key={idx}
              href={safeHref}
              target={safeHref.startsWith('http') ? '_blank' : undefined}
              rel={safeHref.startsWith('http') ? 'noopener noreferrer' : undefined}
              style={{ color: 'var(--color-brand)', textDecoration: 'underline' }}
            >
              {token.text}
            </a>
          );
        }
        return <React.Fragment key={idx}>{token.text}</React.Fragment>;
      })}
    </>
  );
}

export function MarkdownView({ content, fontSize, lineHeight, className }: MarkdownViewProps) {
  const blocks = parseMarkdown(content);
  const resolvedFontSize = fontSize || '0.86rem';
  const resolvedLineHeight = lineHeight || 1.6;

  return (
    <div
      className={`copilot-markdown-body ${className || ''}`}
      style={{ display: 'flex', flexDirection: 'column', gap: '8px', lineHeight: resolvedLineHeight }}
    >
      {blocks.map((block, bIdx) => {
        if (block.type === 'heading') {
          const Tag = block.level <= 2 ? 'h3' : block.level === 3 ? 'h4' : 'h5';
          return (
            <Tag
              key={bIdx}
              style={{
                margin: block.level <= 3 ? '12px 0 4px' : '8px 0 2px',
                fontSize: block.level <= 2 ? '1.02rem' : block.level === 3 ? '0.94rem' : resolvedFontSize,
                fontWeight: 700,
                color: block.level <= 3 ? 'var(--color-brand)' : 'var(--color-text-primary)'
              }}
            >
              <InlineText text={block.text} />
            </Tag>
          );
        }

        if (block.type === 'hr') {
          return (
            <hr
              key={bIdx}
              style={{
                border: 'none',
                borderTop: '1px solid var(--color-border)',
                margin: '10px 0',
                opacity: 0.6
              }}
            />
          );
        }

        if (block.type === 'ul') {
          return (
            <ul
              key={bIdx}
              style={{
                margin: '4px 0',
                paddingLeft: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px'
              }}
            >
              {block.items.map((item, iIdx) => (
                <li key={iIdx} style={{ fontSize: resolvedFontSize, color: 'var(--color-text-primary)', lineHeight: resolvedLineHeight }}>
                  <InlineText text={item} />
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol
              key={bIdx}
              style={{
                margin: '4px 0',
                paddingLeft: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px'
              }}
            >
              {block.items.map((item, iIdx) => (
                <li key={iIdx} style={{ fontSize: resolvedFontSize, color: 'var(--color-text-primary)', lineHeight: resolvedLineHeight }}>
                  <InlineText text={item} />
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'code_block') {
          return (
            <pre
              key={bIdx}
              style={{
                padding: '10px 14px',
                background: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                overflowX: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                color: 'var(--color-brand)',
                margin: '6px 0'
              }}
            >
              <code>{block.content}</code>
            </pre>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={bIdx} style={{ overflowX: 'auto', margin: '8px 0' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.8rem',
                  border: '1px solid var(--color-border)'
                }}
              >
                <thead>
                  <tr style={{ background: 'var(--color-bg-secondary)' }}>
                    {block.headers.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        style={{
                          padding: '6px 10px',
                          border: '1px solid var(--color-border)',
                          textAlign: 'left',
                          fontWeight: 700
                        }}
                      >
                        <InlineText text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((r, rIdx) => (
                    <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)' }}>
                      {r.map((c, cIdx) => (
                        <td
                          key={cIdx}
                          style={{
                            padding: '6px 10px',
                            border: '1px solid var(--color-border)'
                          }}
                        >
                          <InlineText text={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // Paragraph
        return (
          <p key={bIdx} style={{ margin: '4px 0', fontSize: resolvedFontSize, color: 'var(--color-text-primary)', lineHeight: resolvedLineHeight }}>
            <InlineText text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
