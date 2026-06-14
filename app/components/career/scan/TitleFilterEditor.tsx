'use client';

import { useState } from 'react';
import { SCANNER_TITLE_FILTERS } from '@/lib/career-config';

export default function TitleFilterEditor({
  onChange,
}: {
  onChange: (filters: { include: string[]; exclude: string[] }) => void;
}) {
  const [include, setInclude] = useState(
    SCANNER_TITLE_FILTERS.positive.slice(0, 8).join(', ')
  );
  const [exclude, setExclude] = useState(
    SCANNER_TITLE_FILTERS.negative.slice(0, 6).join(', ')
  );

  return (
    <section className="career-panel p-4 md:p-5">
      <h2 className="mb-3 text-lg font-semibold text-[color:var(--career-ink)]">Preview Title Filters</h2>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <label className="career-meta-label mb-1 block">Only show titles containing</label>
          <input
            className="career-input"
            value={include}
            onChange={(event) => setInclude(event.target.value)}
            placeholder="Frontend, React, Design System"
          />
        </div>
        <div>
          <label className="career-meta-label mb-1 block">Hide titles containing</label>
          <input
            className="career-input"
            value={exclude}
            onChange={(event) => setExclude(event.target.value)}
            placeholder="Intern, Backend, Data Engineer"
          />
        </div>
      </div>
      <button
        type="button"
        className="career-button-secondary mt-3"
        onClick={() =>
          onChange({
            include: include
              .split(',')
              .map((token) => token.trim())
              .filter(Boolean),
            exclude: exclude
              .split(',')
              .map((token) => token.trim())
              .filter(Boolean),
          })
        }
      >
        Update preview
      </button>
      <p className="mt-2 text-xs text-[color:var(--career-ink-muted)]">
        These keywords only filter the history preview on this page. They do not change your saved
        scanner defaults.
      </p>
    </section>
  );
}
