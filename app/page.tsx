import { getCompanies } from '@/lib/data';
import Dashboard from './components/Dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const companies = await getCompanies();
  const isStatic = process.env.USE_STATIC_DATA === 'true';

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <Dashboard companies={companies} isStatic={isStatic} />
    </main>
  );
}
