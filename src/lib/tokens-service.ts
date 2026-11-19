import { ensureDatabaseReady, getPool } from './db';
import type { ClientToken } from './types';

function cleanStr(val: unknown): string {
  return String(val ?? '').trim();
}

function mapTokenRow(row: Record<string, unknown>): ClientToken {
  return {
    id: Number(row.id),
    client_id: row.client_id ? Number(row.client_id) : null,
    client_nit: row.client_nit ? String(row.client_nit) : null,
    client_estado: row.client_estado ? String(row.client_estado) : null,
    nombre_cliente: String(row.nombre_cliente || ''),
    modalidad_asignada: String(row.modalidad_asignada || ''),
    grupo: String(row.grupo || ''),
    fecha_adecuacion: String(row.fecha_adecuacion || ''),
    vigencia_token: String(row.vigencia_token || ''),
    vigencia_firma: String(row.vigencia_firma || ''),
    correo_electronico: String(row.correo_electronico || ''),
    clave_correo: String(row.contrasena_gmail || row.contrasena_outlook || ''),
    contrasena_outlook: String(row.contrasena_outlook || ''),
    contrasena_gmail: String(row.contrasena_gmail || ''),
    contrasena_digicert: String(row.contrasena_digicert || ''),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined
  };
}

export async function listTokens(): Promise<ClientToken[]> {
  await ensureDatabaseReady();
  const pool = getPool();

  const { rows } = await pool.query(`
    SELECT
      ct.*,
      c.nit AS client_nit,
      c.estado AS client_estado
    FROM client_tokens ct
    LEFT JOIN clients c
      ON c.id = ct.client_id
      OR (ct.client_id IS NULL AND LOWER(btrim(c.razon_social)) = LOWER(btrim(ct.nombre_cliente)))
    ORDER BY LOWER(ct.nombre_cliente) ASC
  `);

  return rows.map(mapTokenRow);
}

export async function createOrUpsertToken(raw: Record<string, unknown>) {
  await ensureDatabaseReady();
  const pool = getPool();

  const nombre_cliente = cleanStr(raw.nombre_cliente);
  if (!nombre_cliente) {
    return { error: 'El nombre del cliente es obligatorio.', status: 400 as const };
  }

  let clientId: number | null = raw.client_id ? Number(raw.client_id) : null;
  if (!clientId) {
    const match = await pool.query(
      `SELECT id FROM clients WHERE LOWER(btrim(razon_social)) = LOWER(btrim($1)) LIMIT 1`,
      [nombre_cliente]
    );
    if (match.rows[0]) {
      clientId = Number(match.rows[0].id);
    }
  }

  const { rows } = await pool.query(
    `
    INSERT INTO client_tokens (
      client_id, nombre_cliente, modalidad_asignada, grupo, fecha_adecuacion,
      vigencia_token, vigencia_firma, correo_electronico,
      contrasena_outlook, contrasena_gmail, contrasena_digicert
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT ((LOWER(btrim(nombre_cliente)))) DO UPDATE SET
      client_id = COALESCE(EXCLUDED.client_id, client_tokens.client_id),
      modalidad_asignada = EXCLUDED.modalidad_asignada,
      grupo = EXCLUDED.grupo,
      fecha_adecuacion = EXCLUDED.fecha_adecuacion,
      vigencia_token = EXCLUDED.vigencia_token,
      vigencia_firma = EXCLUDED.vigencia_firma,
      correo_electronico = EXCLUDED.correo_electronico,
      contrasena_outlook = EXCLUDED.contrasena_outlook,
      contrasena_gmail = EXCLUDED.contrasena_gmail,
      contrasena_digicert = EXCLUDED.contrasena_digicert,
      updated_at = NOW()
    RETURNING *
    `,
    [
      clientId,
      nombre_cliente,
      cleanStr(raw.modalidad_asignada),
      cleanStr(raw.grupo),
      cleanStr(raw.fecha_adecuacion),
      cleanStr(raw.vigencia_token),
      cleanStr(raw.vigencia_firma),
      cleanStr(raw.correo_electronico),
      '',
      cleanStr(raw.clave_correo ?? raw.contrasena_gmail ?? raw.contrasena_outlook),
      cleanStr(raw.contrasena_digicert)
    ]
  );

  return { token: mapTokenRow(rows[0]) };
}

export async function updateToken(id: number, raw: Record<string, unknown>) {
  await ensureDatabaseReady();
  const pool = getPool();

  const nombre_cliente = cleanStr(raw.nombre_cliente);
  if (!nombre_cliente) {
    return { error: 'El nombre del cliente es obligatorio.', status: 400 as const };
  }

  let clientId: number | null = raw.client_id ? Number(raw.client_id) : null;
  if (!clientId) {
    const match = await pool.query(
      `SELECT id FROM clients WHERE LOWER(btrim(razon_social)) = LOWER(btrim($1)) LIMIT 1`,
      [nombre_cliente]
    );
    if (match.rows[0]) {
      clientId = Number(match.rows[0].id);
    }
  }

  const { rows } = await pool.query(
    `
    UPDATE client_tokens SET
      client_id = $1,
      nombre_cliente = $2,
      modalidad_asignada = $3,
      grupo = $4,
      fecha_adecuacion = $5,
      vigencia_token = $6,
      vigencia_firma = $7,
      correo_electronico = $8,
      contrasena_outlook = $9,
      contrasena_gmail = $10,
      contrasena_digicert = $11,
      updated_at = NOW()
    WHERE id = $12
    RETURNING *
    `,
    [
      clientId,
      nombre_cliente,
      cleanStr(raw.modalidad_asignada),
      cleanStr(raw.grupo),
      cleanStr(raw.fecha_adecuacion),
      cleanStr(raw.vigencia_token),
      cleanStr(raw.vigencia_firma),
      cleanStr(raw.correo_electronico),
      '',
      cleanStr(raw.clave_correo ?? raw.contrasena_gmail ?? raw.contrasena_outlook),
      cleanStr(raw.contrasena_digicert),
      id
    ]
  );

  if (!rows[0]) {
    return { error: 'Registro de token no encontrado.', status: 404 as const };
  }

  return { token: mapTokenRow(rows[0]) };
}

export async function deleteToken(id: number): Promise<boolean> {
  await ensureDatabaseReady();
  const pool = getPool();
  const result = await pool.query(`DELETE FROM client_tokens WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function importTokenRows(rawRows: Array<Record<string, unknown>>) {
  await ensureDatabaseReady();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Preload existing clients by normalized name
    const existingClients = await client.query(`SELECT id, LOWER(btrim(razon_social)) AS norm_name FROM clients`);
    const clientMap = new Map<string, number>();
    for (const r of existingClients.rows) {
      if (r.norm_name) clientMap.set(String(r.norm_name), Number(r.id));
    }

    // Preload existing token rows
    const existingTokens = await client.query(`SELECT LOWER(btrim(nombre_cliente)) AS norm_name FROM client_tokens`);
    const existingTokenSet = new Set<string>(existingTokens.rows.map((r) => String(r.norm_name)));

    let inserted = 0;
    let updated = 0;
    let linked = 0;

    for (const raw of rawRows) {
      const nombre_cliente = cleanStr(raw.nombre_cliente);
      if (!nombre_cliente) continue;

      const normName = nombre_cliente.toLowerCase();
      const matchedClientId = clientMap.get(normName) ?? null;
      if (matchedClientId) linked++;

      const wasExisting = existingTokenSet.has(normName);
      if (wasExisting) updated++;
      else {
        inserted++;
        existingTokenSet.add(normName);
      }

      await client.query(
        `
        INSERT INTO client_tokens (
          client_id, nombre_cliente, modalidad_asignada, grupo, fecha_adecuacion,
          vigencia_token, vigencia_firma, correo_electronico,
          contrasena_outlook, contrasena_gmail, contrasena_digicert
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT ((LOWER(btrim(nombre_cliente)))) DO UPDATE SET
          client_id = COALESCE(EXCLUDED.client_id, client_tokens.client_id),
          modalidad_asignada = EXCLUDED.modalidad_asignada,
          grupo = EXCLUDED.grupo,
          fecha_adecuacion = EXCLUDED.fecha_adecuacion,
          vigencia_token = EXCLUDED.vigencia_token,
          vigencia_firma = EXCLUDED.vigencia_firma,
          correo_electronico = EXCLUDED.correo_electronico,
          contrasena_outlook = EXCLUDED.contrasena_outlook,
          contrasena_gmail = EXCLUDED.contrasena_gmail,
          contrasena_digicert = EXCLUDED.contrasena_digicert,
          updated_at = NOW()
        `,
        [
          matchedClientId,
          nombre_cliente,
          cleanStr(raw.modalidad_asignada),
          cleanStr(raw.grupo),
          cleanStr(raw.fecha_adecuacion),
          cleanStr(raw.vigencia_token),
          cleanStr(raw.vigencia_firma),
          cleanStr(raw.correo_electronico),
          '',
          cleanStr(raw.clave_correo ?? raw.contrasena_gmail ?? raw.contrasena_outlook),
          cleanStr(raw.contrasena_digicert)
        ]
      );
    }

    await client.query('COMMIT');
    return { inserted, updated, linked, total: inserted + updated };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
