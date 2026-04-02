'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SOURCE_COLORS: Record<string, string> = {
  greenhouse: 'bg-green-100 text-green-700',
  lever:      'bg-purple-100 text-purple-700',
  ashby:      'bg-orange-100 text-orange-700',
  hn:         'bg-amber-100 text-amber-700',
  himalayas:  'bg-sky-100 text-sky-700',
  remotive:   'bg-pink-100 text-pink-700',
  yc:         'bg-red-100 text-red-700',
};

function RolesCell({ roles }: { roles: Array<{ title: string; url: string; source?: string }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="font-semibold text-green-600 hover:underline tabular-nums"
      >
        {roles.length} {open ? '▲' : '▼'}
      </button>
      {open && (
        <ul className="mt-1 flex flex-col gap-1">
          {roles.map((r, i) => (
            <li key={i} className="flex items-center gap-1.5">
              {r.source && (
                <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${SOURCE_COLORS[r.source] ?? 'bg-gray-100 text-gray-500'}`}>
                  {r.source}
                </span>
              )}
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline line-clamp-1"
              >
                {r.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Company {
  name: string;
  status: string;
  open_roles: Array<{ title: string; url: string }> | null;
  mentor_linkedins: string[] | null;
  updated_at: string;
  careers_url: string | null;
}

const STATUS_OPTIONS = ['new', 'watching', 'applied', 'closed'] as const;

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  watching: 'bg-yellow-100 text-yellow-700',
  applied: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
};

const LS_KEY = (name: string) => `status__${name}`;

function StatusCell({ name, initial, isStatic }: { name: string; initial: string; isStatic: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(() => {
    if (isStatic && typeof window !== 'undefined') {
      return localStorage.getItem(LS_KEY(name)) ?? initial;
    }
    return initial;
  });
  const [loading, setLoading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setStatus(next);
    if (isStatic) {
      localStorage.setItem(LS_KEY(name), next);
      return;
    }
    setLoading(true);
    try {
      await fetch(`/api/companies/${encodeURIComponent(name)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={loading}
      className={`rounded px-2 py-1 text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${STATUS_COLORS[status] ?? ''}`}
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

export default function CompaniesTable({ companies, isStatic = false }: { companies: Company[]; isStatic?: boolean }) {
  if (companies.length === 0) {
    return (
      <p className="text-center text-gray-400 py-20 text-sm">
        No companies yet. Run the pipeline to populate data.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-gray-600 tracking-wide w-10">#</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600 tracking-wide">Company</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600 tracking-wide">Status</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600 tracking-wide">Open Roles</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600 tracking-wide">Mentor LinkedIn(s)</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600 tracking-wide">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {companies.map((c, i) => {
            const roleCount = Array.isArray(c.open_roles) ? c.open_roles.length : 0;
            const linkedins = c.mentor_linkedins?.filter(Boolean) ?? [];

            return (
              <tr key={c.name} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">{i + 1}</td>
                <td className="px-4 py-3 font-medium">
                  {c.careers_url ? (
                    <a
                      href={c.careers_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {c.name}
                    </a>
                  ) : (
                    c.name
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusCell name={c.name} initial={c.status ?? 'new'} isStatic={isStatic} />
                </td>
                <td className="px-4 py-3">
                  {roleCount > 0 ? (
                    <RolesCell roles={c.open_roles!} />
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {linkedins.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {linkedins.slice(0, 3).map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline truncate max-w-[220px] block text-xs"
                        >
                          {url.replace('https://www.linkedin.com/in/', '')}
                        </a>
                      ))}
                      {linkedins.length > 3 && (
                        <span className="text-xs text-gray-400">+{linkedins.length - 3} more</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {new Date(c.updated_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
