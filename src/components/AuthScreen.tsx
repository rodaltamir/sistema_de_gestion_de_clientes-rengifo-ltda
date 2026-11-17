'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, User as UserIcon } from 'lucide-react';
import type { User } from '@/lib/types';

interface AuthScreenProps {
  initialHasUsers: boolean;
  onAuthenticated: (user: User) => void;
}

export default function AuthScreen({
  initialHasUsers,
  onAuthenticated
}: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>(
    initialHasUsers ? 'login' : 'register'
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showRegPass, setShowRegPass] = useState(false);

  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  async function handleLoginSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      const firstInvalid = form.querySelector<HTMLElement>(':invalid');
      firstInvalid?.focus();
      setError('Completa tu correo o usuario y tu contraseña.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password: loginPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Credenciales incorrectas.');
        return;
      }
      onAuthenticated(data.user);
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      const firstInvalid = form.querySelector<HTMLElement>(':invalid');
      firstInvalid?.focus();
      setError('Verifica los campos obligatorios (usuario mín. 3 caracteres, correo válido y contraseña mín. 6 caracteres).');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          username: username.trim(),
          email: email.trim(),
          password: regPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo crear el usuario.');
        return;
      }
      onAuthenticated(data.user);
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-frame">
        {/* Panel lateral minimalista de marca */}
        <aside className="auth-brand-panel">
          <div className="auth-brand-top">
            <div className="auth-logo-box">
              <img
                src="/assets/logo-rengifo.png"
                alt="Rengifo Ltda"
                className="auth-logo"
                width={52}
                height={52}
              />
            </div>
            <div>
              <h1 className="auth-brand-name">Rengifo Ltda</h1>
              <p className="auth-brand-sub">Sistemas de gestión de clientes</p>
            </div>
          </div>

          <div className="auth-brand-visual">
            <img
              src="/assets/login-hero.jpg"
              alt=""
              className="auth-hero-img"
              aria-hidden="true"
            />
          </div>

          <div className="auth-brand-body">
            <p className="auth-brand-quote">
              Información tributaria, credenciales y saldos organizados en un solo lugar.
            </p>
            <div className="auth-accent-line" aria-hidden="true" />
          </div>
        </aside>

        {/* Panel de formulario */}
        <section className="auth-card" aria-label="Acceso al sistema">
          <div className="auth-tabs" role="tablist" aria-label="Modo de acceso">
            <button
              type="button"
              role="tab"
              id="tab-login"
              aria-selected={mode === 'login'}
              aria-controls="panel-login"
              className={`auth-tab ${mode === 'login' ? 'is-active' : ''}`}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              role="tab"
              id="tab-register"
              aria-selected={mode === 'register'}
              aria-controls="panel-register"
              className={`auth-tab ${mode === 'register' ? 'is-active' : ''}`}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              Crear usuario
            </button>
          </div>

          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}

          {mode === 'login' ? (
            <div id="panel-login" role="tabpanel" aria-labelledby="tab-login">
              <div className="auth-form-intro">
                <h2>Bienvenido</h2>
                <p>Ingresa con tu correo o usuario</p>
              </div>

              <form method="post" onSubmit={handleLoginSubmit} noValidate>
                <div className="field">
                  <label htmlFor="login-identifier">
                    Correo o usuario <span aria-hidden="true">*</span>
                  </label>
                  <div className="input-icon-wrap">
                    <UserIcon size={17} className="input-icon" aria-hidden="true" />
                    <input
                      type="text"
                      id="login-identifier"
                      name="username"
                      autoComplete="username"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      enterKeyHint="next"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Rengifo Ltda o correo@empresa.com"
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="login-password">
                    Contraseña <span aria-hidden="true">*</span>
                  </label>
                  <div className="input-icon-wrap password-wrap">
                    <Lock size={17} className="input-icon" aria-hidden="true" />
                    <input
                      type={showLoginPass ? 'text' : 'password'}
                      id="login-password"
                      name="password"
                      autoComplete="current-password"
                      enterKeyHint="done"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      className="btn-toggle-pass"
                      aria-pressed={showLoginPass}
                      aria-label={showLoginPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      onClick={() => setShowLoginPass((v) => !v)}
                    >
                      {showLoginPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-full auth-submit" disabled={loading}>
                  {loading ? 'Ingresando...' : 'Ingresar'}
                </button>
              </form>
            </div>
          ) : (
            <div id="panel-register" role="tabpanel" aria-labelledby="tab-register">
              <div className="auth-form-intro">
                <h2>Nuevo usuario</h2>
                <p>Crea una cuenta para acceder al directorio</p>
              </div>

              <form method="post" onSubmit={handleRegisterSubmit} noValidate>
                <div className="field">
                  <label htmlFor="reg-fullname">Nombre completo</label>
                  <div className="input-icon-wrap">
                    <UserIcon size={17} className="input-icon" aria-hidden="true" />
                    <input
                      type="text"
                      id="reg-fullname"
                      name="fullName"
                      autoComplete="name"
                      enterKeyHint="next"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Nombre y apellido"
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="reg-username">
                    Usuario <span aria-hidden="true">*</span>
                  </label>
                  <div className="input-icon-wrap">
                    <UserIcon size={17} className="input-icon" aria-hidden="true" />
                    <input
                      type="text"
                      id="reg-username"
                      name="username"
                      autoComplete="username"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      minLength={3}
                      enterKeyHint="next"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Mínimo 3 caracteres"
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="reg-email">
                    Correo electrónico <span aria-hidden="true">*</span>
                  </label>
                  <div className="input-icon-wrap">
                    <Mail size={17} className="input-icon" aria-hidden="true" />
                    <input
                      type="email"
                      id="reg-email"
                      name="email"
                      autoComplete="email"
                      spellCheck={false}
                      enterKeyHint="next"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="correo@rengifo.bo"
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="reg-password">
                    Contraseña <span aria-hidden="true">*</span>
                  </label>
                  <div className="input-icon-wrap password-wrap">
                    <Lock size={17} className="input-icon" aria-hidden="true" />
                    <input
                      type={showRegPass ? 'text' : 'password'}
                      id="reg-password"
                      name="password"
                      autoComplete="new-password"
                      minLength={6}
                      enterKeyHint="done"
                      aria-describedby="reg-pass-hint"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                    <button
                      type="button"
                      className="btn-toggle-pass"
                      aria-pressed={showRegPass}
                      aria-label={showRegPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      onClick={() => setShowRegPass((v) => !v)}
                    >
                      {showRegPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <span id="reg-pass-hint" className="field-hint">
                    Mínimo 6 caracteres.
                  </span>
                </div>

                <button type="submit" className="btn btn-primary btn-full auth-submit" disabled={loading}>
                  {loading ? 'Creando cuenta...' : 'Crear usuario'}
                </button>
              </form>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
