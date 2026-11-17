import { NextResponse } from 'next/server';
import { ensureDatabaseReady, getPool } from '@/lib/db';
import { createSession, SESSION_COOKIE, verifyPassword } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const identifier = String(body.identifier || '').trim();
    const password = String(body.password || '');

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Ingresa tu correo o usuario y tu contraseña.' },
        { status: 400 }
      );
    }

    await ensureDatabaseReady();
    const pool = getPool();
    const { rows } = await pool.query<{
      id: number;
      full_name: string;
      username: string;
      email: string;
      password_hash: string;
    }>(
      `SELECT id, full_name, username, email, password_hash
       FROM users
       WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)
       LIMIT 1`,
      [identifier]
    );

    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json(
        { error: 'Correo/usuario o contraseña incorrectos.' },
        { status: 401 }
      );
    }

    const token = await createSession(user.id);
    const res = NextResponse.json({
      user: {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        email: user.email
      }
    });

    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 86400
    });

    return res;
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    return NextResponse.json({ error: 'Error al iniciar sesión.' }, { status: 500 });
  }
}
