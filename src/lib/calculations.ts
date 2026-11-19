import Decimal from 'decimal.js';
import type { Client, FinancialSummary, Rubro } from './types';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Compute exact financial & tax totals using Decimal.js.
 */
export function calculateFinancialSummary(clients: Client[]): FinancialSummary {
  let honorariosActivos = new Decimal(0);
  let activeCount = 0;
  let totalIva = new Decimal(0);
  let totalIt = new Decimal(0);

  const porRubro: Record<Rubro, { count: number; honorarios: Decimal }> = {
    profesional: { count: 0, honorarios: new Decimal(0) },
    industrial: { count: 0, honorarios: new Decimal(0) },
    alquiler: { count: 0, honorarios: new Decimal(0) },
    empresa: { count: 0, honorarios: new Decimal(0) },
    unipersonal: { count: 0, honorarios: new Decimal(0) },
    otro: { count: 0, honorarios: new Decimal(0) }
  };

  for (const c of clients) {
    const hon = new Decimal(c.honorarios_profesionales || 0);
    const iva = new Decimal(c.saldo_iva || 0);
    const it = new Decimal(c.saldo_it || 0);

    totalIva = totalIva.plus(iva);
    totalIt = totalIt.plus(it);

    if (c.estado === 'Activo') {
      honorariosActivos = honorariosActivos.plus(hon);
      activeCount += 1;
    }

    const rubroKey: Rubro =
      c.rubro in porRubro ? (c.rubro as Rubro) : 'otro';
    porRubro[rubroKey].count += 1;
    porRubro[rubroKey].honorarios = porRubro[rubroKey].honorarios.plus(hon);
  }

  const promedio =
    activeCount > 0 ? honorariosActivos.div(activeCount) : new Decimal(0);

  return {
    totalHonorariosActivos: honorariosActivos.toDecimalPlaces(2).toNumber(),
    proyeccionAnualHonorarios: honorariosActivos.times(12).toDecimalPlaces(2).toNumber(),
    promedioHonorariosActivos: promedio.toDecimalPlaces(2).toNumber(),
    totalSaldoIva: totalIva.toDecimalPlaces(2).toNumber(),
    totalSaldoIt: totalIt.toDecimalPlaces(2).toNumber(),
    totalSaldosFiscales: totalIva.plus(totalIt).toDecimalPlaces(2).toNumber(),
    porRubro: {
      profesional: {
        count: porRubro.profesional.count,
        honorarios: porRubro.profesional.honorarios.toDecimalPlaces(2).toNumber()
      },
      industrial: {
        count: porRubro.industrial.count,
        honorarios: porRubro.industrial.honorarios.toDecimalPlaces(2).toNumber()
      },
      alquiler: {
        count: porRubro.alquiler.count,
        honorarios: porRubro.alquiler.honorarios.toDecimalPlaces(2).toNumber()
      },
      empresa: {
        count: porRubro.empresa.count,
        honorarios: porRubro.empresa.honorarios.toDecimalPlaces(2).toNumber()
      },
      unipersonal: {
        count: porRubro.unipersonal.count,
        honorarios: porRubro.unipersonal.honorarios.toDecimalPlaces(2).toNumber()
      },
      otro: {
        count: porRubro.otro.count,
        honorarios: porRubro.otro.honorarios.toDecimalPlaces(2).toNumber()
      }
    }
  };
}

export function formatBs(value: number | string): string {
  const num = new Decimal(value || 0).toDecimalPlaces(2).toNumber();
  return `Bs. ${num.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Calculate monthly due day (integer 13..22) based on the last digit of the Bolivian NIT (DS 25619):
 * 0 -> 13, 1 -> 14, ..., 9 -> 22.
 */
export function getFechaPagoFromNit(nit: string): number | null {
  const digits = String(nit || '').replace(/\D/g, '');
  if (!digits) return null;
  const lastDigit = Number(digits[digits.length - 1]);
  if (!Number.isInteger(lastDigit) || lastDigit < 0 || lastDigit > 9) return null;
  return 13 + lastDigit;
}
