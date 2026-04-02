'use client';

import { useState } from 'react';
import CompaniesTable from './CompaniesTable';
import LogPanel, { PipelineStatus } from './LogPanel';
import RunPipelineButton from './RunPipelineButton';

interface Company {
  name: string;
  status: string;
  open_roles: Array<{ title: string; url: string; source?: string; category?: string }> | null;
  mentor_linkedins: string[] | null;
  updated_at: string;
  careers_url: string | null;
}

type CategoryFilter = 'all' | 'frontend' | 'pm';

interface Props {
  companies: Company[];
  isStatic: boolean;
}

export default function Dashboard({ companies, isStatic }: Props) {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('idle');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const filtered = categoryFilter === 'all'
    ? companies
    : companies
        .map((c) => ({
          ...c,
          open_roles: c.open_roles?.filter((r) => r.category === categoryFilter) ?? null,
        }))
        .filter((c) => !c.open_roles || c.open_roles.length > 0);

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ADPList Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">
            {companies.length} companies tracked
            {isStatic && <span className="ml-2 text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">static snapshot</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {(['all', 'frontend', 'pm'] as CategoryFilter[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  categoryFilter === cat
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {cat === 'pm' ? 'Product' : cat}
              </button>
            ))}
          </div>
          {!isStatic && <RunPipelineButton status={pipelineStatus} onRun={() => {}} />}
        </div>
      </div>

      {!isStatic && <LogPanel onStatusChange={setPipelineStatus} />}

      <CompaniesTable companies={filtered} isStatic={isStatic} />
    </>
  );
}
