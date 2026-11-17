import { NextResponse } from 'next/server';
import { getSessionUser, hasAnyUsers } from '@/lib/auth';

export async function GET() {
  try {
    const [user, hasUsers] = await Promise.all([getSessionUser(), hasAnyUsers()]);
    return NextResponse.json({ user, hasUsers });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return NextResponse.json({ error: 'Error verificando sesión.' }, { status: 500 });
  }
}
