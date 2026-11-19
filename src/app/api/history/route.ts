import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { listAllHistory, listImportBatches } from '@/lib/clients-service';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada.' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get('q') || '';
  const from = req.nextUrl.searchParams.get('from') || '';
  const to = req.nextUrl.searchParams.get('to') || '';
  const estado = req.nextUrl.searchParams.get('estado') || '';
  const yearParam = req.nextUrl.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : undefined;

  const [records, batches] = await Promise.all([
    listAllHistory({ q, from, to, estado }),
    listImportBatches(year)
  ]);

  return NextResponse.json({ records, batches });
}
