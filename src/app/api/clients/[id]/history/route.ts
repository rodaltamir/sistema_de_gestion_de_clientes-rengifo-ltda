import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  createClientHistory,
  deleteClientHistory,
  listClientHistory
} from '@/lib/clients-service';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada.' }, { status: 401 });
  }

  const { id } = await context.params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  const from = req.nextUrl.searchParams.get('from') || '';
  const to = req.nextUrl.searchParams.get('to') || '';
  const records = await listClientHistory(clientId, from, to);

  return NextResponse.json({ records });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada.' }, { status: 401 });
  }

  const { id } = await context.params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  const body = await req.json();
  const result = await createClientHistory(clientId, body);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ record: result.record }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada.' }, { status: 401 });
  }

  const recordId = Number(req.nextUrl.searchParams.get('recordId'));
  if (!Number.isInteger(recordId) || recordId <= 0) {
    return NextResponse.json({ error: 'ID de registro inválido.' }, { status: 400 });
  }

  const deleted = await deleteClientHistory(recordId);
  if (!deleted) {
    return NextResponse.json({ error: 'Registro no encontrado.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
