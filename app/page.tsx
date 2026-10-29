import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';
import LoginPage from './login/page';

export const dynamic = 'force-dynamic';

/**
 * Root page renders the Sanchay login card directly.
 * Authenticated operators are automatically routed to /dashboard.
 */
export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (await verifySessionToken(token)) {
    redirect('/dashboard');
  }

  return <LoginPage />;
}
