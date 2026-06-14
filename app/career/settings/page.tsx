'use client';

import { useEffect, useState } from 'react';

interface SettingsItem {
  provider: 'anthropic' | 'openai';
  anthropic_api_key: string | null;
  openai_api_key: string | null;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  scan_schedule: string | null;
  updated_at: string;
  active_provider: 'anthropic' | 'openai';
  active_model: string;
  active_has_key: boolean;
}

export default function CareerSettingsPage() {
  const [settings, setSettings] = useState<SettingsItem | null>(null);
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [scanSchedule, setScanSchedule] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadSettings() {
    const response = await fetch('/api/settings', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`We couldn't load your settings (${response.status}).`);
    }
    const payload = (await response.json()) as { item: SettingsItem };
    const item = payload.item;
    setSettings(item);
    setProvider(item.provider);
    setScanSchedule(item.scan_schedule ?? '');
  }

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          anthropic_api_key: anthropicApiKey ? anthropicApiKey : undefined,
          openai_api_key: openAiApiKey ? openAiApiKey : undefined,
          scan_schedule: scanSchedule || null,
        }),
      });
      if (!response.ok) {
        throw new Error(`We couldn't save your settings (${response.status}).`);
      }
      await loadSettings();
      setStatus('Settings saved.');
      setAnthropicApiKey('');
      setOpenAiApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save your settings.");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        provider: string;
        model: string;
        message: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || `Connection test failed (${response.status})`);
      }
      setStatus(`Connection successful: ${payload.provider} (${payload.model})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't verify that connection.");
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    void loadSettings().catch((err) => {
      setError(err instanceof Error ? err.message : "We couldn't load your settings.");
    });
  }, []);

  return (
    <div className="career-motion-stage space-y-4">
      <div>
        <h1 className="career-page-title">Settings</h1>
        <p className="career-page-subtitle">
          Choose the AI provider, manage keys, and keep a note of your scan schedule.
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

      <section className="career-panel p-4">
        <h2 className="career-section-title mb-3">AI Provider</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="career-meta-label mb-1 block">Provider</label>
            <select
              className="career-select"
              value={provider}
              onChange={(event) => setProvider(event.target.value as 'anthropic' | 'openai')}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT-4o)</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => void testConnection()}
              disabled={testing}
              data-busy={testing ? 'true' : 'false'}
              className="career-button-secondary"
            >
              {testing ? 'Checking...' : 'Test connection'}
            </button>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={saving}
              data-busy={saving ? 'true' : 'false'}
              className="career-button-primary"
            >
              {saving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </div>

        <div className="career-inline-empty mt-3">
          Current provider: <span className="font-semibold">{settings?.active_provider ?? provider}</span> · model:{' '}
          <span className="font-semibold">{settings?.active_model ?? 'Not set yet'}</span>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div>
            <label className="career-meta-label mb-1 block">
              Anthropic API Key
            </label>
            <input
              type="password"
              className="career-input"
              placeholder={settings?.has_anthropic_key ? 'Current key saved' : 'Paste a new key'}
              value={anthropicApiKey}
              onChange={(event) => setAnthropicApiKey(event.target.value)}
            />
            <div className="mt-1 text-xs text-[color:var(--career-ink-muted)]">
              {settings?.has_anthropic_key ? 'Saved. Leave blank to keep it.' : 'Not configured yet.'}
            </div>
          </div>
          <div>
            <label className="career-meta-label mb-1 block">
              OpenAI API Key
            </label>
            <input
              type="password"
              className="career-input"
              placeholder={settings?.has_openai_key ? 'Current key saved' : 'Paste a new key'}
              value={openAiApiKey}
              onChange={(event) => setOpenAiApiKey(event.target.value)}
            />
            <div className="mt-1 text-xs text-[color:var(--career-ink-muted)]">
              {settings?.has_openai_key ? 'Saved. Leave blank to keep it.' : 'Not configured yet.'}
            </div>
          </div>
        </div>
      </section>

      <section className="career-panel p-4">
        <h2 className="career-section-title mb-3">Planned Scan Schedule</h2>
        <input
          className="career-input"
          placeholder="e.g. Every weekday at 09:00 IST"
          value={scanSchedule}
          onChange={(event) => setScanSchedule(event.target.value)}
        />
        <p className="mt-2 text-xs text-[color:var(--career-ink-muted)]">
          This is a note for you only. The actual cron schedule is still controlled elsewhere.
        </p>
      </section>

      <section className="career-panel p-4">
        <h2 className="career-section-title mb-2">Export</h2>
        <p className="text-sm text-[color:var(--career-ink-muted)]">
          Use `npm run export` when you want to export data from the terminal.
        </p>
      </section>

      <section className="career-panel-danger p-4">
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--career-danger-ink)]">Danger Zone</h2>
        <p className="text-sm text-[color:var(--career-ink-muted)]">
          Permanent delete actions live on the individual job and source pages.
        </p>
      </section>
    </div>
  );
}
