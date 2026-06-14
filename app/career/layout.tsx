import type { ReactNode } from 'react';
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import CareerShell from '@/app/components/career/layout/CareerShell';

const careerSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-career-sans',
});

const careerMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
  variable: '--font-career-mono',
});

export default function CareerLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${careerSans.variable} ${careerMono.variable} career-ui`}>
      <CareerShell>{children}</CareerShell>
    </div>
  );
}
