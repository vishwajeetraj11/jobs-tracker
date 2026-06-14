'use client';

import { useState } from 'react';

export default function CVEditor({
  markdown,
  onChange,
  onSave,
}: {
  markdown: string;
  onChange: (markdown: string) => void;
  onSave: (markdown: string) => Promise<void> | void;
}) {
  const [saving, setSaving] = useState(false);

  return (
    <section className="career-panel p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--career-ink)]">Resume Draft</h2>
          <p className="mt-1 text-sm text-[color:var(--career-ink-muted)]">
            Edit the Markdown version used for evaluations and exports.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          data-busy={saving ? 'true' : 'false'}
          className="career-button-primary"
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(markdown);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving...' : 'Save resume draft'}
        </button>
      </div>
      <textarea
        className="career-textarea h-[520px] bg-[color:var(--career-surface-soft)] font-mono text-sm text-[color:var(--career-ink)]"
        value={markdown}
        onChange={(event) => onChange(event.target.value)}
        placeholder="# Your Name"
        spellCheck={false}
      />
    </section>
  );
}
