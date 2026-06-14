interface ScanResultRow {
  portal: string;
  type: string;
  candidates: number;
  added: number;
  duplicates: number;
  skipped_title: number;
  skipped_expired: number;
  status: 'success' | 'failed';
  error?: string;
}

function formatLabel(value: string) {
  return value
    .replace(/[_:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ScanResults({ rows }: { rows: ScanResultRow[] }) {
  return (
    <section className="career-panel p-4 md:p-5">
      <h2 className="mb-3 text-lg font-semibold text-[color:var(--career-ink)]">Results by Source</h2>

      {rows.length === 0 ? (
        <div className="career-inline-empty">
          Run a scan to compare what each source found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--career-line)] text-left text-[color:var(--career-ink-subtle)]">
                <th className="pb-2 pr-2 font-medium">Source</th>
                <th className="pb-2 pr-2 font-medium">Type</th>
                <th className="pb-2 pr-2 font-medium">Found</th>
                <th className="pb-2 pr-2 font-medium">Added</th>
                <th className="pb-2 pr-2 font-medium">Already Saved</th>
                <th className="pb-2 pr-2 font-medium">Skipped</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${row.portal}-${idx}`} className="career-surface border-b border-[color:var(--career-line)]/65 last:border-b-0">
                  <td className="py-2 pr-2">
                    <div className="font-medium text-[color:var(--career-ink)]">{row.portal}</div>
                    {row.error ? <div className="mt-1 text-xs text-[color:var(--career-danger-ink)]">{row.error}</div> : null}
                  </td>
                  <td className="py-2 pr-2 text-xs text-[color:var(--career-ink-muted)]">{formatLabel(row.type)}</td>
                  <td className="py-2 pr-2 text-[color:var(--career-ink)]">{row.candidates}</td>
                  <td className="py-2 pr-2 text-[color:var(--career-success-ink)]">{row.added}</td>
                  <td className="py-2 pr-2 text-[color:var(--career-ink)]">{row.duplicates}</td>
                  <td className="py-2 pr-2 text-[color:var(--career-ink)]">{row.skipped_title + row.skipped_expired}</td>
                  <td className="py-2">
                    <span className={row.status === 'success' ? 'career-pill-success' : 'career-pill-danger'}>
                      {row.status === 'success' ? 'Done' : 'Failed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
