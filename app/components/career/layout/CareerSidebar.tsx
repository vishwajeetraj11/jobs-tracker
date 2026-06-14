'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/career', label: 'Dashboard' },
  { href: '/career/jobs', label: 'Jobs' },
  { href: '/career/pipeline', label: 'Evaluate' },
  { href: '/career/scan', label: 'Scans' },
  { href: '/career/reports', label: 'Reports' },
  { href: '/career/cv', label: 'Profile & CV' },
  { href: '/career/settings', label: 'Settings' },
];

export default function CareerSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full border-b border-[color:var(--career-line)] bg-[color:var(--career-bg-strong)] px-3 py-3 md:sticky md:top-0 md:h-screen md:w-[15rem] md:border-b-0 md:border-r md:px-3 md:py-5">
      <div className="career-panel mb-4 px-3.5 py-3">
        <div className="career-meta-label">Career Ops</div>
        <div className="mt-1 text-[0.95rem] font-semibold tracking-tight text-[color:var(--career-ink)]">
          Job Tracker
        </div>
      </div>

      <nav className="flex gap-1.5 overflow-x-auto md:flex-col md:overflow-x-visible">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/career' && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'career-nav-link whitespace-nowrap rounded-lg px-3 py-2 text-[0.84rem] font-medium',
                active
                  ? 'bg-[color:var(--career-accent-soft)] text-[color:var(--career-accent-strong)]'
                  : 'text-[color:var(--career-ink-muted)] hover:bg-[color:var(--career-surface)] hover:text-[color:var(--career-ink)]',
              ].join(' ')}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
