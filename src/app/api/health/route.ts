import { NextResponse } from 'next/server';
import { ensureDatabaseReady, getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureDatabaseReady();
    const pool = getPool();
    await pool.query('SELECT 1');
    return NextResponse.json({ ok: true, db: 'connected' });
  } catch (err) {
    console.error('Healthcheck failed:', err);
    return NextResponse.json({ ok: false, db: 'error' }, { status: 503 });
  }
}
