'use client';

export default function EvaluateAllButton({
  disabled,
  running,
  onClick,
}: {
  disabled?: boolean;
  running?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || running}
      data-busy={running ? 'true' : 'false'}
      onClick={onClick}
      className="career-button-primary"
    >
      {running ? 'Evaluating...' : 'Evaluate all jobs'}
    </button>
  );
}
