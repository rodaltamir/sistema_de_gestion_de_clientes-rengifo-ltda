import * as XLSX from 'xlsx';

export interface ParsedTokenRow {
  rowIndex: number;
  nombre_cliente: string;
  modalidad_asignada: string;
  fecha_adecuacion: string;
  vigencia_token: string;
  vigencia_firma: string;
  correo_electronico: string;
  clave_correo: string;
  contrasena_digicert: string;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function formatExcelDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 90000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const y = String(parsed.y).padStart(4, '0');
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const raw = String(value).trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  const dmyMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }

  return raw;
}

export function formatDisplayDate(isoOrRaw: string): string {
  if (!isoOrRaw) return '—';
  const m = isoOrRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return isoOrRaw;
}

export function getTokenExpiryStatus(dateStr: string): {
  label: string;
  tone: 'ok' | 'warn' | 'danger' | 'neutral';
  daysLeft: number | null;
} {
  if (!dateStr) return { label: 'Sin fecha', tone: 'neutral', daysLeft: null };
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { label: dateStr, tone: 'neutral', daysLeft: null };

  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return { label: `Vencido (${Math.abs(diffDays)}d)`, tone: 'danger', daysLeft: diffDays };
  }
  if (diffDays <= 30) {
    return {
      label: diffDays === 0 ? 'Vence hoy' : `Por vencer (${diffDays}d)`,
      tone: 'warn',
      daysLeft: diffDays
    };
  }
  return { label: `Vigente (${diffDays}d)`, tone: 'ok', daysLeft: diffDays };
}

export async function parseTokenExcelFile(file: File): Promise<ParsedTokenRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];

  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: true
  });

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const row = matrix[i] || [];
    const normCells = row.map(normalizeHeader);
    const hasNombre = normCells.some((c) => c === 'NOMBRE' || c.includes('RAZON SOCIAL'));
    const hasTokenOrMod = normCells.some(
      (c) => c === 'TOKEN' || c.includes('MODALIDAD') || c.includes('FIRMA DIGITAL')
    );
    if (hasNombre && hasTokenOrMod) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error(
      'No se encontró la fila de encabezados (NOMBRE, MODALIDAD ASIGNADA, TOKEN, FIRMA DIGITAL).'
    );
  }

  const headers = (matrix[headerRowIdx] || []).map(normalizeHeader);

  const colMap = {
    nombre: -1,
    modalidad: -1,
    adecuacion: -1,
    token: -1,
    firma: -1,
    correo: -1,
    outlook: -1,
    gmail: -1,
    digicert: -1
  };

  headers.forEach((h, idx) => {
    if (!h) return;
    // Ignore GRUPO and dark-blue columns (ESCRITORIO / RECUPERACION)
    if (h === 'GRUPO' || h.includes('ESCRITORIO') || h.includes('RECUPERACION')) return;

    if (colMap.nombre === -1 && (h === 'NOMBRE' || h.includes('RAZON SOCIAL'))) {
      colMap.nombre = idx;
    } else if (colMap.modalidad === -1 && h.includes('MODALIDAD')) {
      colMap.modalidad = idx;
    } else if (colMap.adecuacion === -1 && h.includes('ADECUACION')) {
      colMap.adecuacion = idx;
    } else if (colMap.token === -1 && h.includes('TOKEN')) {
      colMap.token = idx;
    } else if (colMap.firma === -1 && h.includes('FIRMA')) {
      colMap.firma = idx;
    } else if (colMap.correo === -1 && h.includes('CORREO') && !h.includes('RECUPERACION')) {
      colMap.correo = idx;
    } else if (colMap.outlook === -1 && h.includes('OUTLOOK')) {
      colMap.outlook = idx;
    } else if (colMap.gmail === -1 && h.includes('GMAIL')) {
      colMap.gmail = idx;
    } else if (colMap.digicert === -1 && h.includes('DIGICERT')) {
      colMap.digicert = idx;
    }
  });

  if (colMap.nombre === -1) {
    throw new Error('No se encontró la columna NOMBRE en el archivo Excel.');
  }

  const results: ParsedTokenRow[] = [];
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const nombre = String(row[colMap.nombre] ?? '').trim();
    if (!nombre) continue;

    const outlookPass = colMap.outlook >= 0 ? String(row[colMap.outlook] ?? '').trim() : '';
    const gmailPass = colMap.gmail >= 0 ? String(row[colMap.gmail] ?? '').trim() : '';

    results.push({
      rowIndex: r + 1,
      nombre_cliente: nombre,
      modalidad_asignada: colMap.modalidad >= 0 ? String(row[colMap.modalidad] ?? '').trim() : '',
      fecha_adecuacion: colMap.adecuacion >= 0 ? formatExcelDate(row[colMap.adecuacion]) : '',
      vigencia_token: colMap.token >= 0 ? formatExcelDate(row[colMap.token]) : '',
      vigencia_firma: colMap.firma >= 0 ? formatExcelDate(row[colMap.firma]) : '',
      correo_electronico: colMap.correo >= 0 ? String(row[colMap.correo] ?? '').trim() : '',
      clave_correo: gmailPass || outlookPass,
      contrasena_digicert: colMap.digicert >= 0 ? String(row[colMap.digicert] ?? '').trim() : ''
    });
  }

  return results;
}
