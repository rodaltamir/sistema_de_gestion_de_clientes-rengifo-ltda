import * as XLSX from 'xlsx';
import { getFechaPagoFromNit } from './calculations';
import type { Rubro } from './types';

function normalizeHeader(val: unknown): string {
  return String(val ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function inferCategoryFromName(name: string): Rubro {
  const upper = name.toUpperCase();
  if (/\b(S\.?R\.?L\.?|S\.?A\.?|LTDA\.?|EMPRESA|LOGISTIC|TRANS\.?)\b/.test(upper)) {
    return 'empresa';
  }
  if (/\b(DR\.?|DRA\.?|ING\.?|ARQ\.?|LIC\.?|CONSULTORIO|ESTUDIO)\b/.test(upper)) {
    return 'profesional';
  }
  return 'otro';
}

function parseCategory(raw: unknown, fallbackName: string): Rubro {
  const norm = normalizeHeader(raw);
  if (norm.includes('prof')) return 'profesional';
  if (norm.includes('ind')) return 'industrial';
  if (norm.includes('alq')) return 'alquiler';
  if (norm.includes('unip')) return 'unipersonal';
  if (norm.includes('emp')) return 'empresa';
  if (norm.includes('otr')) return 'otro';
  return inferCategoryFromName(fallbackName);
}

const MONTHS_ES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12
};

export interface ParsedExcelResult {
  rows: Array<Record<string, unknown>>;
  detectedYear: number | null;
  detectedMonth: number | null;
}

/**
 * Parse .xls, .xlsx, .xlsm, or .csv files into normalized client rows,
 * supporting Rengifo Ltda's legacy Excel layout with top banner rows
 * and scanning all sheets if the first sheet is a cover/macro sheet.
 */
export async function parseExcelClientsFile(file: File): Promise<ParsedExcelResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (workbook.SheetNames.length === 0) {
    return { rows: [], detectedYear: null, detectedMonth: null };
  }

  let matrix: unknown[][] = [];
  let headerRowIdx = -1;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const candidateMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: ''
    });

    for (let r = 0; r < Math.min(candidateMatrix.length, 25); r++) {
      const row = candidateMatrix[r] || [];
      const joined = row.map(normalizeHeader).join(' | ');
      if (
        joined.includes('nit') &&
        (joined.includes('razon social') || joined.includes('nombre'))
      ) {
        matrix = candidateMatrix;
        headerRowIdx = r;
        break;
      }
    }

    if (headerRowIdx !== -1) break;
  }

  if (headerRowIdx === -1) {
    throw new Error(
      'No se encontraron las columnas "Nombre / Razón Social" y "NIT" en ninguna hoja del archivo.'
    );
  }

  const headers = (matrix[headerRowIdx] || []).map(normalizeHeader);

  const findCol = (matcher: (h: string) => boolean) =>
    headers.findIndex((h) => h && matcher(h));

  const colRazon = findCol(
    (h) => h.includes('razon social') || (h.includes('nombre') && !h.includes('usuario'))
  );
  const colNit = findCol((h) => h.includes('nit'));
  const colFechaPago = findCol((h) => h.includes('fecha') && h.includes('pago'));
  const colCorreo = findCol((h) => h.includes('correo') || h.includes('electtr') || h.includes('email'));
  const colPassSiat = findCol((h) => h.includes('siat'));
  const colPassCorreo = findCol(
    (h) => (h.includes('contrasena') || h.includes('clave')) && !h.includes('siat')
  );
  let colHonorarios = findCol((h) => h.includes('honorario') || h.includes('monto'));
  const colRubro = findCol((h) => h.includes('categoria') || h === 'rubro');
  const colRubroEsp = findCol((h) => h.includes('rubro especifico') || h.includes('actividad'));
  const colEstado = findCol((h) => h.includes('estado'));
  const colCelular = findCol((h) => h.includes('celular') || h.includes('telefono'));
  const colDireccion = findCol((h) => h.includes('direccion'));
  const colMesCierre = findCol((h) => h.includes('cierre'));
  const colFechaIngreso = findCol((h) => h.includes('ingreso'));

  // In the legacy .xls format, the honorarios column right after CONTRASEÑA CORREO has an empty header
  if (colHonorarios === -1 && colPassCorreo !== -1) {
    const nextIdx = colPassCorreo + 1;
    if (!headers[nextIdx]) {
      colHonorarios = nextIdx;
    }
  }

  const rows: Array<Record<string, unknown>> = [];
  const today = new Date().toISOString().slice(0, 10);

  // Detect year & month from top banner / header rows (e.g. "AGOSTO 2026")
  let detectedYear: number | null = null;
  let detectedMonth: number | null = null;
  for (let r = 0; r <= headerRowIdx; r++) {
    const text = normalizeHeader((matrix[r] || []).join(' '));
    const yearMatch = text.match(/\b(20[1-3]\d)\b/);
    if (yearMatch && !detectedYear) detectedYear = Number(yearMatch[1]);
    for (const [mName, mNum] of Object.entries(MONTHS_ES)) {
      if (text.includes(mName) && !detectedMonth) {
        detectedMonth = mNum;
      }
    }
  }

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const razon = String(row[colRazon] ?? '').trim();
    const nit = String(row[colNit] ?? '').replace(/\.0+$/, '').trim();

    // Skip completely empty or footer rows
    if (!razon && !nit) continue;

    const rawPago = colFechaPago !== -1 ? String(row[colFechaPago] ?? '').trim() : '';
    const fechaPago = /^\d{1,2}$/.test(rawPago)
      ? `Día ${rawPago} de cada mes`
      : rawPago || getFechaPagoFromNit(nit);

    const rawHonorarios = colHonorarios !== -1 ? row[colHonorarios] : 0;
    const honorarios = Number(String(rawHonorarios ?? '0').replace(/[^0-9.-]/g, '')) || 0;

    const rawEstado = colEstado !== -1 ? normalizeHeader(row[colEstado]) : '';
    let estado: 'Activo' | 'Inactivo / Suspendido' | 'Baja' = 'Activo';
    if (rawEstado.includes('baja')) estado = 'Baja';
    else if (rawEstado.includes('inact') || rawEstado.includes('susp') || rawEstado === 'i') {
      estado = 'Inactivo / Suspendido';
    }

    rows.push({
      _rowNumber: r + 1,
      razon_social: razon,
      nit,
      fecha_pago: fechaPago,
      correo: colCorreo !== -1 ? String(row[colCorreo] ?? '').trim() : '',
      contrasena_siat: colPassSiat !== -1 ? String(row[colPassSiat] ?? '').trim() : '',
      contrasena_correo: colPassCorreo !== -1 ? String(row[colPassCorreo] ?? '').trim() : '',
      honorarios_profesionales: honorarios,
      rubro: colRubro !== -1 ? parseCategory(row[colRubro], razon) : inferCategoryFromName(razon),
      rubro_especifico: colRubroEsp !== -1 ? String(row[colRubroEsp] ?? '').trim() : '',
      estado,
      celular: colCelular !== -1 ? String(row[colCelular] ?? '').trim() : '',
      direccion: colDireccion !== -1 ? String(row[colDireccion] ?? '').trim() : '',
      mes_cierre: colMesCierre !== -1 && row[colMesCierre] ? String(row[colMesCierre]).trim() : 'Diciembre',
      fecha_ingreso:
        colFechaIngreso !== -1 && row[colFechaIngreso]
          ? String(row[colFechaIngreso]).trim()
          : today
    });
  }

  return { rows, detectedYear, detectedMonth };
}
