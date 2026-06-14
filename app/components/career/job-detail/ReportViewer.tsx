import MarkdownRenderer from '@/app/components/career/shared/MarkdownRenderer';

export default function ReportViewer({
  markdown,
  reportNum,
}: {
  markdown: string | null;
  reportNum?: number | null;
}) {
  return (
    <section className="career-panel p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[color:var(--career-ink)]">Latest Report</h2>
        {reportNum ? (
          <span className="career-pill-muted">
            Report {reportNum}
          </span>
        ) : null}
      </div>

      {markdown ? (
        <MarkdownRenderer markdown={markdown} />
      ) : (
        <div className="career-inline-empty">
          No report yet. Run an evaluation to generate one.
        </div>
      )}
    </section>
  );
}
