import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { importTokenRows } from '@/lib/tokens-service';

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada o expirada.' }, { status: 401 });
  }

  const body = await req.json();
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'No hay filas válidas para importar.' },
      { status: 400 }
    );
  }

  const result = await importTokenRows(rows);
  return NextResponse.json(result);
}
