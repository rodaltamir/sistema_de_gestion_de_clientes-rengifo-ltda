import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  analyzeAndImportClients,
  getClientStats,
  listImportBatches
} from '@/lib/clients-service';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada.' }, { status: 401 });
  }

  const yearParam = req.nextUrl.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : undefined;
  const batches = await listImportBatches(year);

  return NextResponse.json({ batches });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada.' }, { status: 401 });
  }

  const body = await req.json();
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'No se recibieron filas válidas para procesar.' },
      { status: 400 }
    );
  }

  const dryRun = body.dryRun !== false;
  const duplicateAction = body.duplicateAction === 'update' ? 'update' : 'skip';
  const period = body.period || undefined;

  const result = await analyzeAndImportClients(rows, {
    dryRun,
    duplicateAction,
    period
  });
  const stats = dryRun ? undefined : await getClientStats();

  return NextResponse.json({ ...result, stats });
}
