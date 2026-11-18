import Decimal from 'decimal.js';
import { ensureDatabaseReady, getPool } from './db';
import { getFechaPagoFromNit } from './calculations';
import type { Client, ClientEstado, ClientHistoryRecord, ClientStats, Rubro } from './types';

const VALID_RUBROS = new Set<Rubro>([
  'profesional',
  'industrial',
  'alquiler',
  'empresa',
  'unipersonal',
  'otro'
]);
const VALID_ESTADOS = new Set<ClientEstado>(['Activo', 'Inactivo / Suspendido', 'Baja']);
const VALID_CI_EXTENSIONS = new Set([
  '',
  'LP',
  'CB',
  'SC',
  'OR',
  'PT',
  'TJ',
  'CH',
  'BE',
  'PD',
  'EX'
]);

function parseMoney(value: unknown): number {
  if (value === '' || value === null || value === undefined) return 0;
  try {
    const d = new Decimal(String(value));
    return d.isFinite() ? d.toDecimalPlaces(2).toNumber() : 0;
  } catch {
    return 0;
  }
}

function mapClientRow(row: Record<string, unknown>): Client {
  return {
    id: Number(row.id),
    razon_social: String(row.razon_social || ''),
    nit: String(row.nit || ''),
    fecha_ingreso: String(row.fecha_ingreso || ''),
    fecha_baja: String(row.fecha_baja || ''),
    fecha_inactivacion: String(row.fecha_inactivacion || ''),
    direccion: String(row.direccion || ''),
    correo: String(row.correo || ''),
    contrasena_correo: String(row.contrasena_correo || ''),
    contrasena_siat: String(row.contrasena_siat || ''),
    rubro: (row.rubro as Rubro) || 'otro',
    rubro_especifico: String(row.rubro_especifico || ''),
    ci_numero: String(row.ci_numero || ''),
    ci_extension: String(row.ci_extension || ''),
    fecha_pago: String(row.fecha_pago || ''),
    mes_cierre: String(row.mes_cierre || 'Diciembre'),
    honorarios_profesionales: Number(row.honorarios_profesionales || 0),
    declaraciones_juradas: String(row.declaraciones_juradas || 'Al día'),
    estados_financieros: String(row.estados_financieros || 'Pendiente'),
    dictamen: String(row.dictamen || 'No aplica'),
    saldo_iva: Number(row.saldo_iva || 0),
    saldo_it: Number(row.saldo_it || 0),
    celular: String(row.celular || ''),
    estado: (row.estado as ClientEstado) || 'Activo',
    notas: String(row.notas || ''),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined
  };
}

export function normalizeClientPayload(raw: Record<string, unknown>) {
  const razon_social = String(raw.razon_social || '').trim();
  const nit = String(raw.nit || '').trim();

  if (!razon_social) {
    return { error: 'El nombre o razón social es obligatorio.', status: 400 as const };
  }
  if (!nit) {
    return { error: 'El NIT es obligatorio.', status: 400 as const };
  }

  const correo = String(raw.correo || '').trim();
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return { error: 'El correo electrónico no tiene un formato válido.', status: 400 as const };
  }

  const honorarios = parseMoney(raw.honorarios_profesionales);
  if (honorarios < 0) {
    return { error: 'Los honorarios profesionales no pueden ser negativos.', status: 400 as const };
  }

  const rubroRaw = String(raw.rubro || 'otro').trim().toLowerCase() as Rubro;
  const rubro: Rubro = VALID_RUBROS.has(rubroRaw) ? rubroRaw : 'otro';

  const ci_numero = String(raw.ci_numero || '').trim().toUpperCase();
  const ci_extension = String(raw.ci_extension || '').trim().toUpperCase();

  if (ci_numero && !/^[0-9]{4,12}(-[A-Z0-9]{1,3})?$/.test(ci_numero)) {
    return {
      error: 'El Carnet de Identidad debe tener entre 4 y 12 dígitos (ej. 6849106 o 6849106-1A).',
      status: 400 as const
    };
  }
  if (!VALID_CI_EXTENSIONS.has(ci_extension)) {
    return {
      error: 'La extensión del Carnet de Identidad no es válida.',
      status: 400 as const
    };
  }
  if (rubro === 'unipersonal') {
    if (!ci_numero) {
      return {
        error: 'Para clientes Unipersonal, el número de Carnet de Identidad es obligatorio.',
        status: 400 as const
      };
    }
    if (!ci_extension) {
      return {
        error: 'Para clientes Unipersonal, selecciona la extensión del Carnet de Identidad.',
        status: 400 as const
      };
    }
  }

  const fecha_pago = String(raw.fecha_pago || '').trim() || getFechaPagoFromNit(nit);

  let estado = String(raw.estado || '').trim() as ClientEstado;
  if (!VALID_ESTADOS.has(estado)) {
    if (String(raw.fecha_baja || '').trim()) {
      estado = 'Baja';
    } else if (String(raw.fecha_inactivacion || '').trim()) {
      estado = 'Inactivo / Suspendido';
    } else {
      estado = 'Activo';
    }
  }

  return {
    data: {
      razon_social,
      nit,
      fecha_ingreso: String(raw.fecha_ingreso || '').trim(),
      fecha_baja: String(raw.fecha_baja || '').trim(),
      fecha_inactivacion: String(raw.fecha_inactivacion || '').trim(),
      direccion: String(raw.direccion || '').trim(),
      correo,
      contrasena_correo: String(raw.contrasena_correo || ''),
      contrasena_siat: String(raw.contrasena_siat || ''),
      rubro,
      rubro_especifico: String(raw.rubro_especifico || '').trim(),
      ci_numero,
      ci_extension,
      fecha_pago,
      mes_cierre: String(raw.mes_cierre || 'Diciembre').trim(),
      honorarios_profesionales: honorarios,
      declaraciones_juradas: String(raw.declaraciones_juradas || 'Al día').trim(),
      estados_financieros: String(raw.estados_financieros || 'Pendiente').trim(),
      dictamen: String(raw.dictamen || 'No aplica').trim(),
      saldo_iva: parseMoney(raw.saldo_iva),
      saldo_it: parseMoney(raw.saldo_it),
      celular: String(raw.celular || '').trim(),
      estado,
      notas: String(raw.notas || '').trim()
    }
  };
}

export async function listClients(filters: Record<string, string> = {}): Promise<Client[]> {
  await ensureDatabaseReady();
  const pool = getPool();

  const conditions: string[] = [];
  const params: unknown[] = [];

  const q = String(filters.q || '').trim();
  if (q) {
    params.push(`%${q}%`);
    const pIdx = `$${params.length}`;
    conditions.push(`(
      razon_social ILIKE ${pIdx} OR
      nit ILIKE ${pIdx} OR
      correo ILIKE ${pIdx} OR
      celular ILIKE ${pIdx} OR
      ci_numero ILIKE ${pIdx} OR
      rubro_especifico ILIKE ${pIdx} OR
      direccion ILIKE ${pIdx}
    )`);
  }

  const exactFilters: Array<[string, string]> = [
    ['rubro', 'rubro'],
    ['estado', 'estado'],
    ['mes_cierre', 'mes_cierre'],
    ['declaraciones_juradas', 'declaraciones_juradas'],
    ['estados_financieros', 'estados_financieros'],
    ['dictamen', 'dictamen']
  ];

  for (const [paramKey, colName] of exactFilters) {
    const val = String(filters[paramKey] || '').trim();
    if (val) {
      params.push(val);
      conditions.push(`${colName} = $${params.length}`);
    }
  }

  // Time filters (by ingreso, inactivacion, baja, or historical records)
  const fechaDesde = String(filters.fecha_desde || '').trim();
  const fechaHasta = String(filters.fecha_hasta || '').trim();
  const campoFecha = String(filters.campo_fecha || 'fecha_ingreso').trim();

  if (fechaDesde || fechaHasta) {
    if (campoFecha === 'historico') {
      const subConds: string[] = ['r.client_id = clients.id'];
      if (fechaDesde) {
        params.push(fechaDesde);
        subConds.push(`r.fecha_registro >= $${params.length}`);
      }
      if (fechaHasta) {
        params.push(fechaHasta);
        subConds.push(`r.fecha_registro <= $${params.length}`);
      }
      conditions.push(`EXISTS (SELECT 1 FROM client_records r WHERE ${subConds.join(' AND ')})`);
    } else {
      const allowedDateCols = new Set(['fecha_ingreso', 'fecha_inactivacion', 'fecha_baja']);
      const dateCol = allowedDateCols.has(campoFecha) ? campoFecha : 'fecha_ingreso';
      conditions.push(`${dateCol} != ''`);
      if (fechaDesde) {
        params.push(fechaDesde);
        conditions.push(`${dateCol} >= $${params.length}`);
      }
      if (fechaHasta) {
        params.push(fechaHasta);
        conditions.push(`${dateCol} <= $${params.length}`);
      }
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM clients ${whereClause} ORDER BY LOWER(razon_social) ASC`;
  const { rows } = await pool.query(sql, params);
  return rows.map(mapClientRow);
}

export async function getClientStats(): Promise<ClientStats> {
  await ensureDatabaseReady();
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE estado = 'Activo')::int AS activos,
      COUNT(*) FILTER (WHERE estado = 'Inactivo / Suspendido')::int AS inactivos,
      COUNT(*) FILTER (WHERE estado = 'Baja')::int AS bajas,
      COUNT(*) FILTER (WHERE declaraciones_juradas != 'Al día' AND estado = 'Activo')::int AS ddjj_pendientes
    FROM clients
  `);
  return rows[0] as ClientStats;
}

export async function createClient(raw: Record<string, unknown>) {
  await ensureDatabaseReady();
  const normalized = normalizeClientPayload(raw);
  if (!normalized.data) return { error: normalized.error, status: normalized.status };

  const d = normalized.data;
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO clients (
      razon_social, nit, fecha_ingreso, fecha_baja, fecha_inactivacion,
      direccion, correo, contrasena_correo, contrasena_siat, rubro, rubro_especifico,
      ci_numero, ci_extension, fecha_pago, mes_cierre, honorarios_profesionales, declaraciones_juradas,
      estados_financieros, dictamen, saldo_iva, saldo_it, celular,
      estado, notas
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
    ) RETURNING *`,
    [
      d.razon_social, d.nit, d.fecha_ingreso, d.fecha_baja, d.fecha_inactivacion,
      d.direccion, d.correo, d.contrasena_correo, d.contrasena_siat, d.rubro, d.rubro_especifico,
      d.ci_numero, d.ci_extension, d.fecha_pago, d.mes_cierre, d.honorarios_profesionales, d.declaraciones_juradas,
      d.estados_financieros, d.dictamen, d.saldo_iva, d.saldo_it, d.celular,
      d.estado, d.notas
    ]
  );

  return { client: mapClientRow(rows[0]) };
}

export async function updateClient(id: number, raw: Record<string, unknown>) {
  await ensureDatabaseReady();
  const normalized = normalizeClientPayload(raw);
  if (!normalized.data) return { error: normalized.error, status: normalized.status };

  const d = normalized.data;
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE clients SET
      razon_social = $1, nit = $2, fecha_ingreso = $3, fecha_baja = $4,
      fecha_inactivacion = $5, direccion = $6, correo = $7, contrasena_correo = $8,
      contrasena_siat = $9, rubro = $10, rubro_especifico = $11, ci_numero = $12, ci_extension = $13,
      fecha_pago = $14, mes_cierre = $15,
      honorarios_profesionales = $16, declaraciones_juradas = $17,
      estados_financieros = $18, dictamen = $19, saldo_iva = $20, saldo_it = $21,
      celular = $22, estado = $23, notas = $24, updated_at = NOW()
     WHERE id = $25
     RETURNING *`,
    [
      d.razon_social, d.nit, d.fecha_ingreso, d.fecha_baja,
      d.fecha_inactivacion, d.direccion, d.correo, d.contrasena_correo,
      d.contrasena_siat, d.rubro, d.rubro_especifico, d.ci_numero, d.ci_extension,
      d.fecha_pago, d.mes_cierre,
      d.honorarios_profesionales, d.declaraciones_juradas,
      d.estados_financieros, d.dictamen, d.saldo_iva, d.saldo_it,
      d.celular, d.estado, d.notas, id
    ]
  );

  if (rows.length === 0) {
    return { error: 'Cliente no encontrado.', status: 404 as const };
  }
  return { client: mapClientRow(rows[0]) };
}

export async function deleteClient(id: number): Promise<boolean> {
  await ensureDatabaseReady();
  const pool = getPool();
  const result = await pool.query('DELETE FROM clients WHERE id = $1', [id]);
  return (result.rowCount || 0) > 0;
}

export async function listClientHistory(
  clientId: number,
  from = '',
  to = ''
): Promise<ClientHistoryRecord[]> {
  await ensureDatabaseReady();
  const pool = getPool();
  const params: unknown[] = [clientId];
  const conds: string[] = ['client_id = $1'];

  if (from.trim()) {
    params.push(from.trim());
    conds.push(`fecha_registro >= $${params.length}`);
  }
  if (to.trim()) {
    params.push(to.trim());
    conds.push(`fecha_registro <= $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT * FROM client_records WHERE ${conds.join(' AND ')} ORDER BY fecha_registro DESC, id DESC`,
    params
  );

  return rows.map((r) => ({
    id: Number(r.id),
    client_id: Number(r.client_id),
    periodo: String(r.periodo || ''),
    fecha_registro: String(r.fecha_registro || ''),
    tipo_evento: String(r.tipo_evento || ''),
    estado_pago: (r.estado_pago as ClientHistoryRecord['estado_pago']) || 'Pagado',
    monto_honorarios: Number(r.monto_honorarios || 0),
    saldo_iva: Number(r.saldo_iva || 0),
    saldo_it: Number(r.saldo_it || 0),
    formularios: String(r.formularios || ''),
    observaciones: String(r.observaciones || ''),
    created_at: r.created_at ? String(r.created_at) : undefined
  }));
}

export async function createClientHistory(
  clientId: number,
  raw: Record<string, unknown>
) {
  await ensureDatabaseReady();
  const fecha_registro = String(raw.fecha_registro || '').trim();
  if (!fecha_registro) {
    return { error: 'La fecha de registro es obligatoria.', status: 400 as const };
  }

  const monto_honorarios = parseMoney(raw.monto_honorarios);
  if (monto_honorarios < 0) {
    return { error: 'El monto no puede ser negativo.', status: 400 as const };
  }

  const estadoRaw = String(raw.estado_pago || 'Pagado').trim();
  const estado_pago = ['Pagado', 'Pendiente', 'Observado'].includes(estadoRaw)
    ? estadoRaw
    : 'Pagado';

  const periodo = String(raw.periodo || fecha_registro.slice(0, 7)).trim();
  const tipo_evento = String(raw.tipo_evento || 'Declaración Jurada').trim();
  const saldo_iva = parseMoney(raw.saldo_iva);
  const saldo_it = parseMoney(raw.saldo_it);
  const formularios = String(raw.formularios || '').trim();
  const observaciones = String(raw.observaciones || '').trim();

  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO client_records (
      client_id, periodo, fecha_registro, tipo_evento, estado_pago,
      monto_honorarios, saldo_iva, saldo_it, formularios, observaciones
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      clientId,
      periodo,
      fecha_registro,
      tipo_evento,
      estado_pago,
      monto_honorarios,
      saldo_iva,
      saldo_it,
      formularios,
      observaciones
    ]
  );

  const r = rows[0];
  return {
    record: {
      id: Number(r.id),
      client_id: Number(r.client_id),
      periodo: String(r.periodo),
      fecha_registro: String(r.fecha_registro),
      tipo_evento: String(r.tipo_evento),
      estado_pago: r.estado_pago as ClientHistoryRecord['estado_pago'],
      monto_honorarios: Number(r.monto_honorarios),
      saldo_iva: Number(r.saldo_iva),
      saldo_it: Number(r.saldo_it),
      formularios: String(r.formularios),
      observaciones: String(r.observaciones)
    }
  };
}

export async function deleteClientHistory(recordId: number): Promise<boolean> {
  await ensureDatabaseReady();
  const pool = getPool();
  const result = await pool.query('DELETE FROM client_records WHERE id = $1', [recordId]);
  return (result.rowCount || 0) > 0;
}

export interface ImportPreviewItem {
  rowNumber: number;
  status: 'new' | 'duplicate_db' | 'duplicate_file' | 'invalid';
  reason: string;
  data: Record<string, unknown>;
}

export interface ImportPeriodOptions {
  year?: number;
  monthLabel?: string;
  periodo?: string;
  fecha?: string;
  fileName?: string;
  recordHistory?: boolean;
}

export async function listImportBatches(year?: number) {
  await ensureDatabaseReady();
  const pool = getPool();
  if (year && Number.isInteger(year)) {
    const { rows } = await pool.query(
      'SELECT * FROM import_batches WHERE anio = $1 ORDER BY created_at DESC LIMIT 100',
      [year]
    );
    return rows;
  }
  const { rows } = await pool.query(
    'SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 100'
  );
  return rows;
}

export async function analyzeAndImportClients(
  rawRows: Array<Record<string, unknown>>,
  options: {
    dryRun: boolean;
    duplicateAction?: 'skip' | 'update';
    period?: ImportPeriodOptions;
  }
) {
  await ensureDatabaseReady();
  const pool = getPool();

  const existingRes = await pool.query<{ id: number; nit: string; razon_social: string }>(
    'SELECT id, nit, razon_social FROM clients'
  );
  const existingByNit = new Map<string, { id: number; razon_social: string }>();
  for (const r of existingRes.rows) {
    existingByNit.set(r.nit.trim(), { id: r.id, razon_social: r.razon_social });
  }

  const seenFileNits = new Set<string>();
  const preview: ImportPreviewItem[] = [];
  const counts = { new: 0, duplicate_db: 0, duplicate_file: 0, invalid: 0 };

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNumber = Number(raw._rowNumber || i + 1);
    const normalized = normalizeClientPayload(raw);

    if (!normalized.data) {
      counts.invalid += 1;
      preview.push({
        rowNumber,
        status: 'invalid',
        reason: normalized.error || 'Datos inválidos.',
        data: raw
      });
      continue;
    }

    const nit = normalized.data.nit.trim();
    if (seenFileNits.has(nit)) {
      counts.duplicate_file += 1;
      preview.push({
        rowNumber,
        status: 'duplicate_file',
        reason: `NIT ${nit} repetido dentro del archivo`,
        data: normalized.data
      });
      continue;
    }
    seenFileNits.add(nit);

    const existing = existingByNit.get(nit);
    if (existing) {
      counts.duplicate_db += 1;
      preview.push({
        rowNumber,
        status: 'duplicate_db',
        reason: `Ya registrado (${existing.razon_social})`,
        data: { ...normalized.data, _existingId: existing.id }
      });
      continue;
    }

    counts.new += 1;
    preview.push({
      rowNumber,
      status: 'new',
      reason: 'Listo para importar',
      data: normalized.data
    });
  }

  if (options.dryRun) {
    return { dryRun: true, counts, preview };
  }

  let inserted = 0;
  let updated = 0;
  const duplicateAction = options.duplicateAction || 'skip';
  const now = new Date();
  const periodYear = Number(options.period?.year || now.getFullYear());
  const periodMonthLabel = String(options.period?.monthLabel || '').trim();
  const periodCode = String(options.period?.periodo || now.toISOString().slice(0, 7)).trim();
  const periodFecha = String(options.period?.fecha || now.toISOString().slice(0, 10)).trim();
  const fileName = String(options.period?.fileName || 'archivo.xlsx').trim();
  const recordHistory = options.period?.recordHistory !== false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of preview) {
      let targetClientId: number | null = null;
      const d = item.data;

      if (item.status === 'new') {
        const fechaIngreso = String(d.fecha_ingreso || '').trim() || periodFecha;
        const insRes = await client.query<{ id: number }>(
          `INSERT INTO clients (
            razon_social, nit, fecha_ingreso, fecha_baja, fecha_inactivacion,
            direccion, correo, contrasena_correo, contrasena_siat, rubro, rubro_especifico,
            ci_numero, ci_extension, fecha_pago, mes_cierre, honorarios_profesionales, declaraciones_juradas,
            estados_financieros, dictamen, saldo_iva, saldo_it, celular,
            estado, notas
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
          ) RETURNING id`,
          [
            d.razon_social, d.nit, fechaIngreso, d.fecha_baja, d.fecha_inactivacion,
            d.direccion, d.correo, d.contrasena_correo, d.contrasena_siat, d.rubro, d.rubro_especifico,
            d.ci_numero, d.ci_extension, d.fecha_pago, d.mes_cierre, d.honorarios_profesionales, d.declaraciones_juradas,
            d.estados_financieros, d.dictamen, d.saldo_iva, d.saldo_it, d.celular,
            d.estado, d.notas
          ]
        );
        targetClientId = insRes.rows[0].id;
        inserted += 1;
      } else if (item.status === 'duplicate_db') {
        targetClientId = Number(d._existingId || 0) || null;
        if (duplicateAction === 'update' && targetClientId) {
          await client.query(
            `UPDATE clients SET
              razon_social = $1, correo = $2, contrasena_correo = $3, contrasena_siat = $4,
              fecha_pago = $5, honorarios_profesionales = $6, rubro = $7, rubro_especifico = $8,
              updated_at = NOW()
             WHERE id = $9`,
            [
              d.razon_social,
              d.correo,
              d.contrasena_correo,
              d.contrasena_siat,
              d.fecha_pago,
              d.honorarios_profesionales,
              d.rubro,
              d.rubro_especifico,
              targetClientId
            ]
          );
          updated += 1;
        }
      }

      // Record time-based historical entry for this client & period
      if (recordHistory && targetClientId) {
        const existsHist = await client.query(
          `SELECT id FROM client_records
           WHERE client_id = $1 AND periodo = $2 AND tipo_evento = 'Importación Período'
           LIMIT 1`,
          [targetClientId, periodCode]
        );
        if (existsHist.rows.length === 0) {
          await client.query(
            `INSERT INTO client_records (
              client_id, periodo, fecha_registro, tipo_evento, estado_pago,
              monto_honorarios, saldo_iva, saldo_it, formularios, observaciones
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              targetClientId,
              periodCode,
              periodFecha,
              'Importación Período',
              'Pagado',
              Number(d.honorarios_profesionales || 0),
              Number(d.saldo_iva || 0),
              Number(d.saldo_it || 0),
              String(d.fecha_pago || ''),
              `Importado (${periodMonthLabel ? `${periodMonthLabel} ` : ''}${periodYear}) · ${fileName}`
            ]
          );
        }
      }
    }

    await client.query(
      `INSERT INTO import_batches (
        archivo, periodo, anio, mes, fecha_periodo, nuevos, actualizados, total_filas
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        fileName,
        periodCode,
        periodYear,
        periodMonthLabel,
        periodFecha,
        inserted,
        updated,
        preview.length
      ]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { dryRun: false, inserted, updated, counts };
}
