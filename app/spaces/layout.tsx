import '../ops.css';
import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth/session';

export default async function SpacesLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUserFromCookies();
  // Police station personnel only access the Vehicle module; only Admin can access both.
  if (user && user.role !== 'ADMIN' && (user.stationId || user.role === 'STATION_OFFICER' || user.role === 'FIELD_STAFF')) {
    redirect('/dashboard');
  }
  return children;
}

