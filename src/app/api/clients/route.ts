import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { createClient, getClientStats, listClients } from '@/lib/clients-service';
import { calculateFinancialSummary } from '@/lib/calculations';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada o expirada.' }, { status: 401 });
  }

  const filters = Object.fromEntries(req.nextUrl.searchParams.entries());
  const [clients, stats] = await Promise.all([listClients(filters), getClientStats()]);
  const summary = calculateFinancialSummary(clients);

  return NextResponse.json({ clients, stats, summary });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada o expirada.' }, { status: 401 });
  }

  const body = await req.json();
  const result = await createClient(body);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const stats = await getClientStats();
  return NextResponse.json({ client: result.client, stats }, { status: 201 });
}
