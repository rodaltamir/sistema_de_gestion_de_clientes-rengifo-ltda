import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getSessionUser } from '@/lib/auth';
import { listClients } from '@/lib/clients-service';
import { calculateFinancialSummary } from '@/lib/calculations';

const RUBRO_LABELS: Record<string, string> = {
  profesional: 'Profesional',
  industrial: 'Industrial',
  alquiler: 'Alquiler',
  otro: 'Otro'
};

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sesión no iniciada o expirada.' }, { status: 401 });
  }

  const filters = Object.fromEntries(req.nextUrl.searchParams.entries());
  const clients = await listClients(filters);
  const summary = calculateFinancialSummary(clients);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistemas de gestión de clientes Rengifo Ltda';
  workbook.created = new Date();

  // Sheet 1: Directorio de Clientes
  const sheet = workbook.addWorksheet('Clientes Rengifo Ltda', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  sheet.columns = [
    { header: 'Razón Social / Nombre', key: 'razon_social', width: 36 },
    { header: 'NIT', key: 'nit', width: 16 },
    { header: 'Estado', key: 'estado', width: 20 },
    { header: 'Rubro', key: 'rubro', width: 14 },
    { header: 'Celular', key: 'celular', width: 14 },
    { header: 'Correo Electrónico', key: 'correo', width: 28 },
    { header: 'Dirección', key: 'direccion', width: 34 },
    { header: 'Fecha Ingreso', key: 'fecha_ingreso', width: 14 },
    { header: 'Fecha Inactivación', key: 'fecha_inactivacion', width: 16 },
    { header: 'Fecha Baja', key: 'fecha_baja', width: 14 },
    { header: 'Fecha de Pago', key: 'fecha_pago', width: 20 },
    { header: 'Mes de Cierre', key: 'mes_cierre', width: 14 },
    { header: 'Honorarios (Bs.)', key: 'honorarios_profesionales', width: 18 },
    { header: 'Declaraciones Juradas', key: 'declaraciones_juradas', width: 20 },
    { header: 'Estados Financieros', key: 'estados_financieros', width: 18 },
    { header: 'Dictamen', key: 'dictamen', width: 16 },
    { header: 'Saldo IVA (Bs.)', key: 'saldo_iva', width: 16 },
    { header: 'Saldo IT (Bs.)', key: 'saldo_it', width: 16 },
    { header: 'Notas', key: 'notas', width: 36 }
  ];

  // Header styling (Dark Gray + Orange accent)
  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' }
    };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FFE87700' } }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  for (const c of clients) {
    const row = sheet.addRow({
      ...c,
      rubro: RUBRO_LABELS[c.rubro] || c.rubro
    });
    row.getCell('honorarios_profesionales').numFmt = '#,##0.00';
    row.getCell('saldo_iva').numFmt = '#,##0.00';
    row.getCell('saldo_it').numFmt = '#,##0.00';
  }

  // Sheet 2: Resumen Financiero (Decimal.js)
  const summarySheet = workbook.addWorksheet('Resumen Financiero');
  summarySheet.columns = [
    { header: 'Indicador Financiero / Fiscal', key: 'metric', width: 38 },
    { header: 'Valor', key: 'value', width: 22 }
  ];

  const sumHeader = summarySheet.getRow(1);
  sumHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE87700' } };
  });

  summarySheet.addRow({ metric: 'Clientes en el reporte', value: clients.length });
  const rHon = summarySheet.addRow({
    metric: 'Honorarios mensuales (clientes activos)',
    value: summary.totalHonorariosActivos
  });
  const rAnual = summarySheet.addRow({
    metric: 'Proyección anual de honorarios (12 meses)',
    value: summary.proyeccionAnualHonorarios
  });
  const rProm = summarySheet.addRow({
    metric: 'Promedio honorarios por cliente activo',
    value: summary.promedioHonorariosActivos
  });
  const rIva = summarySheet.addRow({
    metric: 'Total Saldo IVA acumulado',
    value: summary.totalSaldoIva
  });
  const rIt = summarySheet.addRow({
    metric: 'Total Saldo IT acumulado',
    value: summary.totalSaldoIt
  });
  const rFisc = summarySheet.addRow({
    metric: 'Total Saldos Fiscales (IVA + IT)',
    value: summary.totalSaldosFiscales
  });

  [rHon, rAnual, rProm, rIva, rIt, rFisc].forEach((r) => {
    r.getCell('value').numFmt = '"Bs. "#,##0.00';
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `clientes_rengifo_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  });
}
