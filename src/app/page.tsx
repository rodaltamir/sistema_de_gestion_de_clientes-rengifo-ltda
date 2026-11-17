import AppShell from '@/components/AppShell';
import { getSessionUser, hasAnyUsers } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [user, hasUsers] = await Promise.all([
    getSessionUser().catch(() => null),
    hasAnyUsers().catch(() => false)
  ]);

  return <AppShell initialUser={user} initialHasUsers={hasUsers} />;
}
