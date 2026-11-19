import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteToken, updateToken } from '@/lib/tokens-service';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada o expirada.' }, { status: 401 });
  }

  const { id } = await context.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  const body = await req.json();
  const result = await updateToken(numId, body);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ token: result.token });
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
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  const deleted = await deleteToken(numId);
  if (!deleted) {
    return NextResponse.json({ error: 'Registro no encontrado.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
