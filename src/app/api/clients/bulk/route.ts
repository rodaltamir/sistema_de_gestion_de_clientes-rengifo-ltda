import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { bulkClientsAction, getClientStats } from '@/lib/clients-service';

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada.' }, { status: 401 });
  }

  const body = await req.json();
  const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
  const action = body.action;
  const value = body.value;

  const result = await bulkClientsAction(ids, action, value);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const stats = await getClientStats();
  return NextResponse.json({ ...result, stats });
}
