export default function JDViewer({ text }: { text: string }) {
  return (
    <section className="career-panel p-4 md:p-5">
      <h2 className="mb-3 text-lg font-semibold text-[color:var(--career-ink)]">Job Description</h2>
      <div className="career-panel-soft max-h-[560px] overflow-y-auto whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-[color:var(--career-ink-muted)]">
        {text || "We haven't captured the job description yet. Run an evaluation or refresh the scan to fetch it."}
      </div>
    </section>
  );
}
