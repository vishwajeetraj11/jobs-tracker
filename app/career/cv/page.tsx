'use client';

import { useEffect, useState } from 'react';
import ProfileForm, { type ProfileData } from '@/app/components/career/cv/ProfileForm';
import CVEditor from '@/app/components/career/cv/CVEditor';

interface ProfileApiItem {
  id: number;
  data: Record<string, unknown>;
  cv_md: string;
  updated_at: string;
}

interface ResumeImportItem {
  filename: string;
  chars: number;
  provider: 'anthropic' | 'openai';
  model: string;
  profile: ProfileData;
  cv_md: string;
}

function summarizeHtmlLikePayload(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return 'Server returned an HTML error page. Check terminal logs for the underlying API error.';
  }
  return trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
}

async function readApiJson<T extends Record<string, unknown>>(response: Response, action: string) {
  const raw = await response.text();
  let parsed: T | null = null;

  if (raw) {
    try {
      parsed = JSON.parse(raw) as T;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const fromJson =
      parsed && typeof parsed.error === 'string' && parsed.error.trim()
        ? parsed.error.trim()
        : null;

    if (fromJson) {
      throw new Error(fromJson);
    }

    const summary = summarizeHtmlLikePayload(raw);
    throw new Error(summary ? `${action} (${response.status}): ${summary}` : `${action} (${response.status})`);
  }

  if (!parsed) {
    const summary = summarizeHtmlLikePayload(raw);
    throw new Error(summary ? `${action}: ${summary}` : `${action}: Invalid JSON response.`);
  }

  return parsed;
}

export default function CareerCvPage() {
  const [profile, setProfile] = useState<ProfileApiItem | null>(null);
  const [cvMarkdown, setCvMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  async function loadProfile() {
    setLoading(true);
    try {
      const response = await fetch('/api/profile', { cache: 'no-store' });
      const payload = await readApiJson<{ item: ProfileApiItem }>(response, "We couldn't load your profile");
      setProfile(payload.item);
      setCvMarkdown(payload.item.cv_md || '');
      setError(null);
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(data: ProfileData) {
    setError(null);
    setStatus(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const payload = await readApiJson<{ item: ProfileApiItem }>(response, "We couldn't save your profile");
      setProfile((prev) =>
        prev
          ? {
              ...payload.item,
              cv_md: prev.cv_md,
            }
          : payload.item
      );
      setStatus('Profile saved. Future evaluations will use these details.');
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save your profile.");
    }
  }

  async function saveCv(markdown: string) {
    setError(null);
    setStatus(null);

    try {
      const response = await fetch('/api/cv', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cv_md: markdown }),
      });
      const payload = await readApiJson<{ item: ProfileApiItem }>(response, "We couldn't save your resume draft");
      setProfile((prev) =>
        prev
          ? {
              ...payload.item,
              data: prev.data,
            }
          : payload.item
      );
      setCvMarkdown(payload.item.cv_md || markdown);
      setStatus('Resume draft saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save your resume draft.");
    }
  }

  async function importResume() {
    if (!resumeFile) {
      setError('Choose a resume file before importing.');
      return;
    }

    setImporting(true);
    setError(null);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append('file', resumeFile);

      const response = await fetch('/api/cv/import', {
        method: 'POST',
        body: formData,
      });

      const payload = await readApiJson<{ item?: ResumeImportItem; error?: string }>(
        response,
        "We couldn't import that resume"
      );
      if (!payload.item) {
        throw new Error(payload.error || "We couldn't read any resume data from that file.");
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              data: {
                ...prev.data,
                ...payload.item?.profile,
              },
              cv_md: payload.item?.cv_md ?? prev.cv_md,
            }
          : prev
      );
      setCvMarkdown(payload.item.cv_md);

      setStatus(
        `Imported ${payload.item.filename}. Review the profile and resume draft below, then save anything you want to keep.`
      );
      setResumeFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't import that resume.");
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    void loadProfile().catch((err) => {
      setError(err instanceof Error ? err.message : "We couldn't load your profile.");
      setLoading(false);
    });
  }, []);

  return (
    <div className="career-motion-stage space-y-4">
      <div>
        <h1 className="career-page-title">Profile & Resume</h1>
        <p className="career-page-subtitle">
          These details are used when generating job evaluations and resume-based reports.
        </p>
      </div>

      {status ? (
        <div className="career-alert career-alert-success">
          {status}
        </div>
      ) : null}
      {error ? (
        <div className="career-alert career-alert-error">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="career-panel px-4 py-6 text-sm text-[color:var(--career-ink-muted)]">
          Loading your profile...
        </div>
      ) : null}

      {!loading && !profile ? (
        <section className="career-panel-danger p-4">
          <h2 className="career-section-title mb-2 text-[color:var(--career-danger-ink)]">Profile unavailable</h2>
          <p className="text-sm text-[color:var(--career-ink-muted)]">
            Could not load your profile. Check that the database is set up, then try again.
          </p>
          <button
            type="button"
            onClick={() =>
              void loadProfile().catch((err) =>
                setError(err instanceof Error ? err.message : "We couldn't load your profile.")
              )
            }
            className="career-button-danger mt-3"
          >
            Retry
          </button>
        </section>
      ) : null}

      {profile ? (
        <>
          <section className="career-panel p-4">
            <h2 className="career-section-title mb-2">Import Resume</h2>
            <p className="mb-3 text-sm text-[color:var(--career-ink-muted)]">
              Upload a PDF, DOCX, TXT, or Markdown file. We'll pull out profile details and draft a
              resume in Markdown for you.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="career-input max-w-sm px-2 py-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[color:var(--career-accent-ghost)] file:px-3 file:py-2 file:text-[color:var(--career-accent-strong)]"
                onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                disabled={!resumeFile || importing}
                onClick={() => void importResume()}
                data-busy={importing ? 'true' : 'false'}
                className="career-button-primary"
              >
                {importing ? 'Importing...' : 'Import resume'}
              </button>
            </div>
            {resumeFile ? (
              <p className="mt-2 text-xs text-[color:var(--career-ink-muted)]">
                Selected: {resumeFile.name} ({Math.round(resumeFile.size / 1024)} KB)
              </p>
            ) : null}
          </section>

          <ProfileForm
            initial={profile.data as ProfileData}
            onSave={(next) => saveProfile(next)}
          />

          <CVEditor
            markdown={cvMarkdown}
            onChange={setCvMarkdown}
            onSave={(markdown) => saveCv(markdown)}
          />
        </>
      ) : null}
    </div>
  );
}
