import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteClient, getClientStats, updateClient } from '@/lib/clients-service';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada o expirada.' }, { status: 401 });
  }

  const { id } = await context.params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  const body = await req.json();
  const result = await updateClient(clientId, body);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const stats = await getClientStats();
  return NextResponse.json({ client: result.client, stats });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada o expirada.' }, { status: 401 });
  }

  const { id } = await context.params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  const deleted = await deleteClient(clientId);
  if (!deleted) {
    return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
  }

  const stats = await getClientStats();
  return NextResponse.json({ ok: true, stats });
}
