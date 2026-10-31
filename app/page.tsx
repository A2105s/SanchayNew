import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE_NAME, getSessionPayload } from '@/lib/auth/session';
import LoginPage from './login/page';

export const dynamic = 'force-dynamic';

/**
 * Root page renders the Sanchay login card directly.
 * Authenticated operators are automatically routed to /dashboard or /spaces.
 */
export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionPayload(token);
  if (session) {
    const moduleCookie = cookieStore.get('sanchay_module')?.value;
    const isSpacesUser = ['spaces.admin', 'dept.spaces', 'spaces.pwd'].includes(session.sub.toLowerCase());
    if (moduleCookie === 'spaces' || isSpacesUser) {
      redirect('/spaces');
    }
    redirect('/dashboard');
  }

  return <LoginPage />;
}
