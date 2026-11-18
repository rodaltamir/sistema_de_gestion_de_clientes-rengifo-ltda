import crypto from 'node:crypto';
import { Pool } from 'pg';

const globalForPg = globalThis as unknown as {
  __rengifoPool?: Pool;
  __rengifoInitPromise?: Promise<void>;
};

function hashSeedPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function getPool(): Pool {
  if (!globalForPg.__rengifoPool) {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://rengifo:rengifo_secret@localhost:5432/rengifo_clientes';

    const pool = new Pool({
      connectionString,
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    pool.on('error', (err) => {
      console.error('PostgreSQL pool idle client error:', err.message);
    });

    globalForPg.__rengifoPool = pool;
  }
  return globalForPg.__rengifoPool;
}

async function waitForPostgres(pool: Pool, maxAttempts = 10): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const delayMs = Math.min(500 * attempt, 3000);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/**
 * Ensure PostgreSQL schema, CHECK constraints, admin user, and sample clients exist.
 */
export async function ensureDatabaseReady(): Promise<void> {
  if (!globalForPg.__rengifoInitPromise) {
    globalForPg.__rengifoInitPromise = (async () => {
      const pool = getPool();
      await waitForPostgres(pool);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          full_name TEXT NOT NULL DEFAULT '',
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT chk_users_username_len CHECK (length(btrim(username)) >= 3),
          CONSTRAINT chk_users_email_format CHECK (email ~* '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$')
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS clients (
          id SERIAL PRIMARY KEY,
          razon_social TEXT NOT NULL,
          nit TEXT NOT NULL,
          fecha_ingreso TEXT NOT NULL DEFAULT '',
          fecha_baja TEXT NOT NULL DEFAULT '',
          fecha_inactivacion TEXT NOT NULL DEFAULT '',
          direccion TEXT NOT NULL DEFAULT '',
          correo TEXT NOT NULL DEFAULT '',
          contrasena_correo TEXT NOT NULL DEFAULT '',
          contrasena_siat TEXT NOT NULL DEFAULT '',
          rubro TEXT NOT NULL DEFAULT 'otro',
          rubro_especifico TEXT NOT NULL DEFAULT '',
          ci_numero TEXT NOT NULL DEFAULT '',
          ci_extension TEXT NOT NULL DEFAULT '',
          fecha_pago TEXT NOT NULL DEFAULT '',
          mes_cierre TEXT NOT NULL DEFAULT 'Diciembre',
          honorarios_profesionales NUMERIC(14, 2) NOT NULL DEFAULT 0,
          declaraciones_juradas TEXT NOT NULL DEFAULT 'Al día',
          estados_financieros TEXT NOT NULL DEFAULT 'Pendiente',
          dictamen TEXT NOT NULL DEFAULT 'No aplica',
          saldo_iva NUMERIC(14, 2) NOT NULL DEFAULT 0,
          saldo_it NUMERIC(14, 2) NOT NULL DEFAULT 0,
          celular TEXT NOT NULL DEFAULT '',
          estado TEXT NOT NULL DEFAULT 'Activo',
          representante_legal TEXT NOT NULL DEFAULT '',
          tipo_contribuyente TEXT NOT NULL DEFAULT 'Régimen General',
          notas TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT chk_clients_razon_nonempty CHECK (length(btrim(razon_social)) > 0),
          CONSTRAINT chk_clients_nit_nonempty CHECK (length(btrim(nit)) > 0),
          CONSTRAINT chk_clients_rubro_valid CHECK (rubro IN ('profesional', 'industrial', 'alquiler', 'empresa', 'unipersonal', 'otro')),
          CONSTRAINT chk_clients_ci_ext_valid CHECK (ci_extension IN ('', 'LP', 'CB', 'SC', 'OR', 'PT', 'TJ', 'CH', 'BE', 'PD', 'EX')),
          CONSTRAINT chk_clients_ci_num_valid CHECK (ci_numero = '' OR ci_numero ~ '^[0-9]{4,12}(-[A-Za-z0-9]{1,3})?$'),
          CONSTRAINT chk_clients_estado_valid CHECK (estado IN ('Activo', 'Inactivo / Suspendido', 'Baja')),
          CONSTRAINT chk_clients_honorarios_nonneg CHECK (honorarios_profesionales >= 0)
        );

        CREATE INDEX IF NOT EXISTS idx_clients_nit ON clients(nit);
        CREATE INDEX IF NOT EXISTS idx_clients_rubro ON clients(rubro);
        CREATE INDEX IF NOT EXISTS idx_clients_estado ON clients(estado);
        CREATE INDEX IF NOT EXISTS idx_clients_mes_cierre ON clients(mes_cierre);

        CREATE TABLE IF NOT EXISTS client_records (
          id SERIAL PRIMARY KEY,
          client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          periodo TEXT NOT NULL DEFAULT '',
          fecha_registro TEXT NOT NULL,
          tipo_evento TEXT NOT NULL DEFAULT 'Declaración Jurada',
          estado_pago TEXT NOT NULL DEFAULT 'Pagado',
          monto_honorarios NUMERIC(14, 2) NOT NULL DEFAULT 0,
          saldo_iva NUMERIC(14, 2) NOT NULL DEFAULT 0,
          saldo_it NUMERIC(14, 2) NOT NULL DEFAULT 0,
          formularios TEXT NOT NULL DEFAULT '',
          observaciones TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT chk_records_estado_valid CHECK (estado_pago IN ('Pagado', 'Pendiente', 'Observado')),
          CONSTRAINT chk_records_monto_nonneg CHECK (monto_honorarios >= 0)
        );

        CREATE INDEX IF NOT EXISTS idx_client_records_client ON client_records(client_id);
        CREATE INDEX IF NOT EXISTS idx_client_records_fecha ON client_records(fecha_registro);

        CREATE TABLE IF NOT EXISTS import_batches (
          id SERIAL PRIMARY KEY,
          archivo TEXT NOT NULL DEFAULT '',
          periodo TEXT NOT NULL DEFAULT '',
          anio INTEGER NOT NULL,
          mes TEXT NOT NULL DEFAULT '',
          fecha_periodo TEXT NOT NULL DEFAULT '',
          nuevos INTEGER NOT NULL DEFAULT 0,
          actualizados INTEGER NOT NULL DEFAULT 0,
          total_filas INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_import_batches_anio ON import_batches(anio);
      `);

      // Ensure constraints and role column exist on upgraded databases
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'role'
          ) THEN
            ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_clients_razon_nonempty') THEN
            ALTER TABLE clients ADD CONSTRAINT chk_clients_razon_nonempty CHECK (length(btrim(razon_social)) > 0);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_clients_nit_nonempty') THEN
            ALTER TABLE clients ADD CONSTRAINT chk_clients_nit_nonempty CHECK (length(btrim(nit)) > 0);
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'clients' AND column_name = 'rubro_especifico'
          ) THEN
            ALTER TABLE clients ADD COLUMN rubro_especifico TEXT NOT NULL DEFAULT '';
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'clients' AND column_name = 'ci_numero'
          ) THEN
            ALTER TABLE clients ADD COLUMN ci_numero TEXT NOT NULL DEFAULT '';
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'clients' AND column_name = 'ci_extension'
          ) THEN
            ALTER TABLE clients ADD COLUMN ci_extension TEXT NOT NULL DEFAULT '';
          END IF;

          ALTER TABLE clients DROP CONSTRAINT IF EXISTS chk_clients_rubro_valid;
          ALTER TABLE clients ADD CONSTRAINT chk_clients_rubro_valid CHECK (rubro IN ('profesional', 'industrial', 'alquiler', 'empresa', 'unipersonal', 'otro'));

          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_clients_ci_ext_valid') THEN
            ALTER TABLE clients ADD CONSTRAINT chk_clients_ci_ext_valid CHECK (ci_extension IN ('', 'LP', 'CB', 'SC', 'OR', 'PT', 'TJ', 'CH', 'BE', 'PD', 'EX'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_clients_ci_num_valid') THEN
            ALTER TABLE clients ADD CONSTRAINT chk_clients_ci_num_valid CHECK (ci_numero = '' OR ci_numero ~ '^[0-9]{4,12}(-[A-Za-z0-9]{1,3})?$');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_clients_estado_valid') THEN
            ALTER TABLE clients ADD CONSTRAINT chk_clients_estado_valid CHECK (estado IN ('Activo', 'Inactivo / Suspendido', 'Baja'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_clients_honorarios_nonneg') THEN
            ALTER TABLE clients ADD CONSTRAINT chk_clients_honorarios_nonneg CHECK (honorarios_profesionales >= 0);
          END IF;
        END $$;
      `);

      // Clean expired sessions on startup
      await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()');

      // Seed default admin user if not present
      await seedAdminUser(pool);

      const { rows } = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM clients'
      );
      if (Number(rows[0]?.count || 0) === 0) {
        await seedSampleClients(pool);
      }

      const recCount = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM client_records'
      );
      if (Number(recCount.rows[0]?.count || 0) === 0) {
        await seedSampleHistory(pool);
      }
    })().catch((err) => {
      globalForPg.__rengifoInitPromise = undefined;
      throw err;
    });
  }
  return globalForPg.__rengifoInitPromise;
}

async function seedAdminUser(pool: Pool): Promise<void> {
  const adminEmail = 'audirengifo.ltda@gmail.com';
  const adminUsername = 'Rengifo Ltda';
  const existing = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)',
    [adminEmail, adminUsername]
  );
  if (existing.rows.length > 0) return;

  const passwordHash = hashSeedPassword('clientes26');
  await pool.query(
    `INSERT INTO users (full_name, username, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'admin')
     ON CONFLICT DO NOTHING`,
    ['Rengifo Ltda (Admin)', adminUsername, adminEmail, passwordHash]
  );
}

async function seedSampleClients(pool: Pool): Promise<void> {
  const samples = [
    [
      'Constructora e Ingeniería Andina S.R.L.',
      '1028475021',
      '2022-03-15',
      '',
      '',
      'Av. Arce N° 2450, Edif. Torre Sur, Piso 4, La Paz',
      'contabilidad@andina-ing.bo',
      'Andina*2026#',
      'SiatAndina!88',
      'industrial',
      'Día 15 de cada mes',
      'Marzo',
      2800,
      'Al día',
      'Presentado',
      'Con dictamen',
      14520.5,
      3200.0,
      '71548920',
      'Activo',
      'Carlos Mendoza Quispe',
      'Régimen General',
      'Empresa constructora e industrial. Cierre fiscal en marzo. Enviar reporte mensual los días 10.'
    ],
    [
      'Dra. Valeria Suárez Torrico (Consultorio Médico)',
      '4829103014',
      '2023-07-01',
      '',
      '',
      'Calle 21 de Calacoto N° 8120, Of. 202',
      'vsuarez.med@gmail.com',
      'ValeriaMed23!',
      'VS_siat_4829',
      'profesional',
      'Día 17 de cada mes',
      'Diciembre',
      650,
      'Al día',
      'No aplica',
      'No aplica',
      1850.0,
      0,
      '77290114',
      'Activo',
      'Valeria Suárez Torrico',
      'Profesional Independiente',
      'Presenta Form. 200, 400 y RC-IVA trimestral.'
    ],
    [
      'Inmobiliaria y Alquileres El Prado S.A.',
      '3190482029',
      '2021-01-10',
      '',
      '',
      'Av. 16 de Julio N° 1620, Centro',
      'admin@elpradoalquileres.bo',
      'PradoAdmin#91',
      'PradoSiat*2025',
      'alquiler',
      'Día 22 de cada mes',
      'Diciembre',
      1400,
      'Pendiente',
      'En proceso',
      'Sin dictamen',
      0,
      450.25,
      '69841230',
      'Activo',
      'Patricia Gutiérrez Roca',
      'Régimen General',
      'Pendiente envío de facturas de mantenimiento del mes.'
    ],
    [
      'Textiles Altiplano Ltda.',
      '2049581022',
      '2020-05-20',
      '',
      '2025-11-01',
      'Parque Industrial Santiváñez, Manzano C-4',
      'gerencia@textilesaltiplano.com',
      'Textil2020$',
      'AltSiat#2049',
      'industrial',
      'Día 13 de cada mes',
      'Marzo',
      1900,
      'Al día',
      'Presentado',
      'Con dictamen',
      6340.75,
      1120.0,
      '70612398',
      'Inactivo / Suspendido',
      'Roberto Mamani Flores',
      'Régimen General',
      'Actividad suspendida temporalmente desde noviembre. Mantener declaraciones sin movimiento.'
    ],
    [
      'Comercializadora Horizonte Norte',
      '5519204018',
      '2019-09-12',
      '2025-06-30',
      '2025-04-15',
      'Av. Blanco Galindo Km 4.5, Cochabamba',
      'horizonte.norte@outlook.com',
      'Horizonte19*',
      'HN_siat_5519',
      'otro',
      'Día 20 de cada mes',
      'Diciembre',
      950,
      'Al día',
      'Presentado',
      'Sin dictamen',
      0,
      0,
      '76450912',
      'Baja',
      'Jorge Luis Paredes',
      'Régimen General',
      'Cierre definitivo tramitado en junio 2025. Archivo histórico.'
    ],
    [
      'Estudio de Arquitectura & Diseño Modular',
      '6192837011',
      '2024-02-01',
      '',
      '',
      'Barrio Equipetrol, Calle 6 Este N° 45, Santa Cruz',
      'hola@modulararq.bo',
      'Modular2024!',
      'ModSiat*619',
      'profesional',
      'Día 14 de cada mes',
      'Diciembre',
      1200,
      'Observado',
      'Pendiente',
      'No aplica',
      920.4,
      180.0,
      '78512044',
      'Activo',
      'Andrea Velasco Justiniano',
      'Régimen General',
      'Revisar observación en factura de proveedor #412.'
    ]
  ];

  const sql = `
    INSERT INTO clients (
      razon_social, nit, fecha_ingreso, fecha_baja, fecha_inactivacion,
      direccion, correo, contrasena_correo, contrasena_siat, rubro,
      fecha_pago, mes_cierre, honorarios_profesionales, declaraciones_juradas,
      estados_financieros, dictamen, saldo_iva, saldo_it, celular,
      estado, representante_legal, tipo_contribuyente, notas
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
    )
  `;

  for (const row of samples) {
    await pool.query(sql, row);
  }
}

async function seedSampleHistory(pool: Pool): Promise<void> {
  const { rows: clients } = await pool.query<{
    id: number;
    honorarios_profesionales: string;
    saldo_iva: string;
    saldo_it: string;
  }>('SELECT id, honorarios_profesionales, saldo_iva, saldo_it FROM clients ORDER BY id ASC LIMIT 4');

  if (clients.length === 0) return;

  const insertSql = `
    INSERT INTO client_records (
      client_id, periodo, fecha_registro, tipo_evento, estado_pago,
      monto_honorarios, saldo_iva, saldo_it, formularios, observaciones
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `;

  for (const c of clients) {
    await pool.query(insertSql, [
      c.id,
      '2026-10',
      '2026-10-15',
      'Declaración Jurada',
      'Pagado',
      Number(c.honorarios_profesionales || 0),
      Number(c.saldo_iva || 0),
      Number(c.saldo_it || 0),
      'Form. 200 (IVA), Form. 400 (IT)',
      'Presentación mensual realizada en plazo.'
    ]);
    await pool.query(insertSql, [
      c.id,
      '2026-11',
      '2026-11-12',
      'Pago Honorarios',
      'Pagado',
      Number(c.honorarios_profesionales || 0),
      Number(c.saldo_iva || 0),
      Number(c.saldo_it || 0),
      'Recibo de honorarios + Form. 200/400',
      'Pago y envío de respaldo al día.'
    ]);
  }
}
