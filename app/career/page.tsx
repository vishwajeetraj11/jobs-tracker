import { getMetrics } from '@/lib/career-ops-data';
import MetricsStrip from '@/app/components/career/dashboard/MetricsStrip';
import TopOpportunities from '@/app/components/career/dashboard/TopOpportunities';
import ActivityFeed from '@/app/components/career/dashboard/ActivityFeed';
import ScanStatus from '@/app/components/career/dashboard/ScanStatus';

export const dynamic = 'force-dynamic';

export default async function CareerDashboardPage() {
  const metrics = await getMetrics();

  return (
    <div className="career-motion-stage space-y-4">
      <div>
        <h1 className="career-page-title">Career Dashboard</h1>
        <p className="career-page-subtitle">
          Run scans, review fit, and move strong roles forward from one workspace.
        </p>
      </div>

      <MetricsStrip totals={metrics.totals} />

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <TopOpportunities jobs={metrics.top_jobs} />
        <ScanStatus latest={metrics.latest_scan} />
      </div>

      <ActivityFeed items={metrics.activity} />
    </div>
  );
}
