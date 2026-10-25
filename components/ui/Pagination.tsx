'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPage }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);

  return (
    <div className="table-pagination">
      <span>
        {total === 0 ? 'No records' : `${from.toLocaleString('en-IN')}–${to.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')}`}
      </span>
      <div className="pagination-actions">
        <button
          type="button"
          className="button button--secondary button--sm"
          onClick={() => onPage(current - 1)}
          disabled={current <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
          <span>Prev</span>
        </button>
        <span className="mono" aria-live="polite">
          {current} / {totalPages}
        </span>
        <button
          type="button"
          className="button button--secondary button--sm"
          onClick={() => onPage(current + 1)}
          disabled={current >= totalPages}
          aria-label="Next page"
        >
          <span>Next</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
