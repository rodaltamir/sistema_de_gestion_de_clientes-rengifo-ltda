import { NextResponse } from 'next/server';
import { ensureDatabaseReady, getPool } from '@/lib/db';
import { createSession, hashPassword, SESSION_COOKIE } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const fullName = String(body.fullName || '').trim();
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!username || username.length < 3) {
      return NextResponse.json(
        { error: 'El nombre de usuario debe tener al menos 3 caracteres.' },
        { status: 400 }
      );
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Ingresa un correo electrónico válido.' },
        { status: 400 }
      );
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres.' },
        { status: 400 }
      );
    }

    await ensureDatabaseReady();
    const pool = getPool();
    const existing = await pool.query<{ username: string; email: string }>(
      'SELECT username, email FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
      [username, email]
    );

    if (existing.rows.length > 0) {
      const match = existing.rows[0];
      if (match.email.toLowerCase() === email) {
        return NextResponse.json(
          { error: 'Ya existe una cuenta registrada con ese correo electrónico.' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Ese nombre de usuario ya está en uso.' },
        { status: 409 }
      );
    }

    const passwordHash = hashPassword(password);
    const { rows } = await pool.query<{
      id: number;
      full_name: string;
      username: string;
      email: string;
    }>(
      `INSERT INTO users (full_name, username, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, username, email`,
      [fullName || username, username, email, passwordHash]
    );

    const user = rows[0];
    const token = await createSession(user.id);
    const res = NextResponse.json({ user }, { status: 201 });

    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 86400
    });

    return res;
  } catch (err) {
    console.error('POST /api/auth/register error:', err);
    return NextResponse.json({ error: 'Error al registrar usuario.' }, { status: 500 });
  }
}
