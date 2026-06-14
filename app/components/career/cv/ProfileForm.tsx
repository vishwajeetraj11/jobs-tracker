'use client';

import { useEffect, useState } from 'react';

export interface ProfileData {
  name?: string;
  email?: string;
  location?: string;
  target_role?: string;
  summary?: string;
  skills?: string;
}

export default function ProfileForm({
  initial,
  onSave,
}: {
  initial: ProfileData;
  onSave: (next: ProfileData) => Promise<void> | void;
}) {
  const [form, setForm] = useState<ProfileData>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  return (
    <section className="career-panel p-4 md:p-5">
      <h2 className="mb-1 text-lg font-semibold text-[color:var(--career-ink)]">Profile Details</h2>
      <p className="mb-3 text-sm text-[color:var(--career-ink-muted)]">
        These details help the evaluator judge fit and tailor each report.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <label className="career-meta-label mb-1 block">Full name</label>
          <input
            className="career-input"
            placeholder="Your name"
            value={form.name ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </div>
        <div>
          <label className="career-meta-label mb-1 block">Email address</label>
          <input
            className="career-input"
            placeholder="name@example.com"
            value={form.email ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
        </div>
        <div>
          <label className="career-meta-label mb-1 block">Current location</label>
          <input
            className="career-input"
            placeholder="Bengaluru, India"
            value={form.location ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
          />
        </div>
        <div>
          <label className="career-meta-label mb-1 block">Target role</label>
          <input
            className="career-input"
            placeholder="Senior Frontend Engineer"
            value={form.target_role ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, target_role: event.target.value }))}
          />
        </div>
      </div>
      <div className="mt-2">
        <label className="career-meta-label mb-1 block">Professional summary</label>
        <textarea
          className="career-textarea h-24"
          placeholder="2 to 4 lines about your experience, strengths, and what you want next."
          value={form.summary ?? ''}
          onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
        />
      </div>
      <div className="mt-2">
        <label className="career-meta-label mb-1 block">Key skills</label>
        <textarea
          className="career-textarea h-20"
          placeholder="React, TypeScript, Design Systems, Performance"
          value={form.skills ?? ''}
          onChange={(event) => setForm((prev) => ({ ...prev, skills: event.target.value }))}
        />
        <p className="mt-1 text-xs text-[color:var(--career-ink-muted)]">Use commas between skills.</p>
      </div>
      <button
        type="button"
        disabled={saving}
        data-busy={saving ? 'true' : 'false'}
        className="career-button-primary mt-3"
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(form);
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? 'Saving...' : 'Save profile'}
      </button>
    </section>
  );
}
