import '../vehicles.css';
import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth/session';

export default async function VehiclesLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUserFromCookies();
  if (user && user.role !== 'ADMIN') {
    const isSpacesUser = ['spaces.admin', 'dept.spaces', 'spaces.pwd', 'spaces', 'spaces.officer'].includes(user.username.toLowerCase());
    if (isSpacesUser || (!user.stationId && user.role !== 'STATION_OFFICER' && user.role !== 'FIELD_STAFF')) {
      redirect('/spaces');
    }
  }
  return children;
}

