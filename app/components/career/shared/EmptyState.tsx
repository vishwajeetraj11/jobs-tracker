export default function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="career-empty-state">
      <h3 className="text-base font-semibold text-[color:var(--career-ink)]">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm text-[color:var(--career-ink-muted)]">
        {description}
      </p>
    </div>
  );
}
