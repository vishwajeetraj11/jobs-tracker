'use client';

import { useEffect, useState } from 'react';
import {
  PORTAL_TYPE_LABELS,
  PORTAL_TYPES,
  getDefaultPortalConfig,
  type PortalType,
} from '@/lib/career-config';

interface PortalItem {
  id: number;
  name: string;
  type: PortalType;
  config: Record<string, unknown>;
  enabled: boolean;
}

export default function PortalEditor({
  editing,
  onSave,
  onCancelEdit,
}: {
  editing: PortalItem | null;
  onSave: (payload: {
    id?: number;
    name: string;
    type: PortalType;
    config: Record<string, unknown>;
    enabled: boolean;
  }) => void;
  onCancelEdit: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<PortalType>('search_query');
  const [enabled, setEnabled] = useState(true);
  const [configJson, setConfigJson] = useState(() =>
    JSON.stringify(getDefaultPortalConfig('search_query'), null, 2)
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setName('');
      setType('search_query');
      setEnabled(true);
      setConfigJson(JSON.stringify(getDefaultPortalConfig('search_query'), null, 2));
      return;
    }
    setName(editing.name);
    setType(editing.type);
    setEnabled(editing.enabled);
    setConfigJson(JSON.stringify(editing.config, null, 2));
  }, [editing]);

  return (
    <section className="career-panel p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--career-ink)]">
            {editing ? 'Edit Source' : 'Add Source'}
          </h2>
          <p className="mt-1 text-sm text-[color:var(--career-ink-muted)]">
            Give the source a clear name, choose how it works, then edit the JSON settings.
          </p>
        </div>
        {editing ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="career-button-secondary min-h-[38px] px-3 py-2 text-xs"
          >
            Cancel
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        <div>
          <label className="career-meta-label mb-1 block">Source Name</label>
          <input
            className="career-input"
            placeholder="For example: OpenAI careers"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div>
          <label className="career-meta-label mb-1 block">Source Type</label>
          <select
            className="career-select"
            value={type}
            onChange={(event) => {
              const nextType = event.target.value as PortalType;
              setType(nextType);
              setConfigJson(JSON.stringify(getDefaultPortalConfig(nextType), null, 2));
            }}
          >
            {PORTAL_TYPES.map((portalType) => (
              <option key={portalType} value={portalType}>
                {PORTAL_TYPE_LABELS[portalType]}
              </option>
            ))}
          </select>
        </div>

        <label className="career-panel-soft flex min-h-[48px] items-center gap-3 px-4 py-3 text-sm text-[color:var(--career-ink)]">
          <input
            type="checkbox"
            className="career-checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Include this source in future scans
        </label>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="career-meta-label block">JSON Settings</label>
            <span className="text-[11px] text-[color:var(--career-ink-muted)]">
              Changing the source type loads a starter template.
            </span>
          </div>
          <textarea
            className="career-textarea h-56 font-mono text-xs leading-6"
            value={configJson}
            onChange={(event) => setConfigJson(event.target.value)}
            spellCheck={false}
          />
        </div>

        {error ? <div className="career-alert career-alert-error">{error}</div> : null}

        <button
          type="button"
          className="career-button-primary w-full"
          onClick={() => {
            try {
              setError(null);
              if (!name.trim()) {
                throw new Error('Give this source a name before saving.');
              }
              const parsedConfig = JSON.parse(configJson) as Record<string, unknown>;
              onSave({
                id: editing?.id,
                name: name.trim(),
                type,
                enabled,
                config: parsedConfig,
              });

              if (!editing) {
                setName('');
                setType('search_query');
                setEnabled(true);
                setConfigJson(JSON.stringify(getDefaultPortalConfig('search_query'), null, 2));
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Check the JSON settings and try again.');
            }
          }}
        >
          {editing ? 'Save Changes' : 'Save Source'}
        </button>
      </div>
    </section>
  );
}
