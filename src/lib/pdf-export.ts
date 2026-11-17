import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatBs } from './calculations';
import type { Client, FinancialSummary } from './types';

const RUBRO_LABELS: Record<string, string> = {
  profesional: 'Profesional',
  industrial: 'Industrial',
  alquiler: 'Alquiler',
  otro: 'Otro'
};

export function exportClientsToPdf(clients: Client[], summary: FinancialSummary) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Header
  doc.setFillColor(31, 41, 55); // Dark gray
  doc.rect(0, 0, 297, 22, 'F');
  doc.setFillColor(232, 119, 0); // Corporate orange
  doc.rect(0, 22, 297, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Sistemas de gestión de clientes Rengifo Ltda', 14, 11);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const today = new Date().toLocaleDateString('es-BO');
  doc.text(`Generado el ${today} · ${clients.length} cliente(s)`, 14, 17);

  // Financial Summary Bar (calculated with Decimal.js)
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Honorarios Activos/Mes: ${formatBs(summary.totalHonorariosActivos)}   |   Proyección Anual: ${formatBs(summary.proyeccionAnualHonorarios)}   |   Saldo IVA Total: ${formatBs(summary.totalSaldoIva)}   |   Saldo IT Total: ${formatBs(summary.totalSaldoIt)}`,
    14,
    30
  );

  autoTable(doc, {
    startY: 35,
    head: [
      [
        'Razón Social',
        'NIT',
        'Rubro',
        'Estado',
        'Cierre / Pago',
        'DD.JJ. / EE.FF.',
        'Honorarios',
        'Saldo IVA',
        'Saldo IT',
        'Celular'
      ]
    ],
    body: clients.map((c) => [
      c.razon_social,
      c.nit,
      RUBRO_LABELS[c.rubro] || c.rubro,
      c.estado,
      `${c.mes_cierre || '—'} / ${c.fecha_pago || '—'}`,
      `${c.declaraciones_juradas} / ${c.estados_financieros}`,
      formatBs(c.honorarios_profesionales),
      formatBs(c.saldo_iva),
      formatBs(c.saldo_it),
      c.celular || '—'
    ]),
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      textColor: [31, 41, 55]
    },
    headStyles: {
      fillColor: [31, 41, 55],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    alternateRowStyles: {
      fillColor: [248, 249, 250]
    },
    columnStyles: {
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' }
    }
  });

  doc.save(`clientes_rengifo_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportSingleClientPdf(client: Client) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(31, 41, 55);
  doc.rect(0, 0, 210, 24, 'F');
  doc.setFillColor(232, 119, 0);
  doc.rect(0, 24, 210, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Rengifo Ltda · Ficha de Cliente', 14, 11);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${client.razon_social} (NIT: ${client.nit})`, 14, 18);

  const rows = [
    ['Razón Social / Nombre', client.razon_social],
    ['NIT', client.nit],
    ['Estado', client.estado],
    ['Rubro', RUBRO_LABELS[client.rubro] || client.rubro],
    ['Celular', client.celular || '—'],
    ['Correo Electrónico', client.correo || '—'],
    ['Dirección', client.direccion || '—'],
    ['Fecha de Ingreso', client.fecha_ingreso || '—'],
    ['Fecha de Inactivación / Susp.', client.fecha_inactivacion || '—'],
    ['Fecha de Baja', client.fecha_baja || '—'],
    ['Fecha de Pago', client.fecha_pago || '—'],
    ['Mes de Cierre', client.mes_cierre || '—'],
    ['Honorarios Profesionales', formatBs(client.honorarios_profesionales)],
    ['Declaraciones Juradas', client.declaraciones_juradas],
    ['Estados Financieros', client.estados_financieros],
    ['Dictamen', client.dictamen],
    ['Saldo IVA', formatBs(client.saldo_iva)],
    ['Saldo IT', formatBs(client.saldo_it)],
    ['Notas', client.notas || '—']
  ];

  autoTable(doc, {
    startY: 32,
    head: [['Campo', 'Detalle']],
    body: rows,
    styles: { fontSize: 9, cellPadding: 2.8 },
    headStyles: { fillColor: [232, 119, 0], textColor: [255, 255, 255] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 62 } }
  });

  const safeName = client.nit.replace(/[^a-zA-Z0-9_-]/g, '');
  doc.save(`ficha_${safeName || 'cliente'}_rengifo.pdf`);
}
