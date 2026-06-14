'use client';

import {
  JOB_STATUS_DEFINITIONS,
  type JobStatus,
} from '@/lib/career-config';

export default function StatusDropdown({
  value,
  disabled = false,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (status: JobStatus) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as JobStatus)}
      className="career-select w-[10.75rem] min-w-[10.75rem] text-sm font-medium"
    >
      {JOB_STATUS_DEFINITIONS.map((status) => (
        <option key={status.id} value={status.id}>
          {status.label}
        </option>
      ))}
    </select>
  );
}
