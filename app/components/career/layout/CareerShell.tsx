import type { ReactNode } from 'react';
import CareerSidebar from './CareerSidebar';

export default function CareerShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[color:var(--career-bg)]">
      <div className="mx-auto flex w-full max-w-[1420px] flex-col md:min-h-screen md:flex-row">
        <CareerSidebar />
        <section className="min-w-0 flex-1 px-4 pb-8 pt-5 md:px-8 md:pb-10 md:pt-7 lg:px-10">
          {children}
        </section>
      </div>
    </main>
  );
}
