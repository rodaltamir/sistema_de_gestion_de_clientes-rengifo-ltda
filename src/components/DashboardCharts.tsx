'use client';

import React, { useMemo } from 'react';
import Decimal from 'decimal.js';
import { formatBs } from '@/lib/calculations';
import type { Client, FinancialSummary, Rubro } from '@/lib/types';

interface DashboardChartsProps {
  clients: Client[];
  summary: FinancialSummary;
}

const RUBRO_META: Array<{ key: Rubro; label: string; color: string }> = [
  { key: 'profesional', label: 'Profesional', color: '#4f46e5' },
  { key: 'industrial', label: 'Industrial', color: '#e87700' },
  { key: 'alquiler', label: 'Alquiler', color: '#0d9488' },
  { key: 'otro', label: 'Otro', color: '#7c3aed' }
];

const CIERRE_ORDER = ['Marzo', 'Junio', 'Septiembre', 'Diciembre'];

export default function DashboardCharts({ clients, summary }: DashboardChartsProps) {
  const totalClients = clients.length;

  // 1. Donut chart segments
  const donutSegments = useMemo(() => {
    if (totalClients === 0) return [];
    const radius = 44;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    return RUBRO_META.map((item) => {
      const count = summary.porRubro[item.key].count;
      const pct = count / totalClients;
      const dash = pct * circumference;
      const seg = {
        ...item,
        count,
        pct: Math.round(pct * 100),
        honorarios: summary.porRubro[item.key].honorarios,
        dashArray: `${dash} ${circumference - dash}`,
        dashOffset: -offset
      };
      offset += dash;
      return seg;
    }).filter((s) => s.count > 0);
  }, [summary, totalClients]);

  // 2. Tax compliance breakdown
  const compliance = useMemo(() => {
    const ddjj = { alDia: 0, pendiente: 0, observado: 0 };
    const eeff = { presentado: 0, proceso: 0, pendiente: 0, noAplica: 0 };

    for (const c of clients) {
      if (c.declaraciones_juradas === 'Al día') ddjj.alDia += 1;
      else if (c.declaraciones_juradas === 'Pendiente') ddjj.pendiente += 1;
      else ddjj.observado += 1;

      if (c.estados_financieros === 'Presentado') eeff.presentado += 1;
      else if (c.estados_financieros === 'En proceso') eeff.proceso += 1;
      else if (c.estados_financieros === 'Pendiente') eeff.pendiente += 1;
      else eeff.noAplica += 1;
    }

    return { ddjj, eeff };
  }, [clients]);

  // 3. Honorarios by Mes de Cierre
  const cierreBars = useMemo(() => {
    const map: Record<string, { count: number; honorarios: Decimal }> = {
      Marzo: { count: 0, honorarios: new Decimal(0) },
      Junio: { count: 0, honorarios: new Decimal(0) },
      Septiembre: { count: 0, honorarios: new Decimal(0) },
      Diciembre: { count: 0, honorarios: new Decimal(0) }
    };

    for (const c of clients) {
      const mes = CIERRE_ORDER.includes(c.mes_cierre) ? c.mes_cierre : 'Diciembre';
      map[mes].count += 1;
      map[mes].honorarios = map[mes].honorarios.plus(c.honorarios_profesionales || 0);
    }

    const items = CIERRE_ORDER.map((mes) => ({
      mes,
      count: map[mes].count,
      honorarios: map[mes].honorarios.toDecimalPlaces(2).toNumber()
    }));

    const maxHon = Math.max(...items.map((i) => i.honorarios), 1);
    return items.map((i) => ({
      ...i,
      heightPct: Math.max((i.honorarios / maxHon) * 100, i.count > 0 ? 10 : 0)
    }));
  }, [clients]);

  const pct = (n: number) => (totalClients > 0 ? `${(n / totalClients) * 100}%` : '0%');

  return (
    <section className="charts-grid" aria-label="Dashboard visual">
      {/* Gráfico 1: Distribución por Rubro */}
      <article className="chart-card">
        <header className="chart-header">
          <h3>Distribución por Rubro</h3>
          <span className="chart-total">{totalClients} clientes</span>
        </header>

        <div className="donut-layout">
          <svg viewBox="0 0 120 120" className="donut-svg" aria-hidden="true">
            <circle cx="60" cy="60" r="44" fill="none" stroke="#f3f4f6" strokeWidth="16" />
            {donutSegments.map((seg) => (
              <circle
                key={seg.key}
                cx="60"
                cy="60"
                r="44"
                fill="none"
                stroke={seg.color}
                strokeWidth="16"
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
                transform="rotate(-90 60 60)"
              />
            ))}
            <text x="60" y="57" textAnchor="middle" className="donut-center-num">
              {totalClients}
            </text>
            <text x="60" y="72" textAnchor="middle" className="donut-center-lbl">
              Total
            </text>
          </svg>

          <ul className="chart-legend">
            {RUBRO_META.map((item) => {
              const info = summary.porRubro[item.key];
              return (
                <li key={item.key} className="legend-row">
                  <span className="legend-dot" style={{ background: item.color }} />
                  <span className="legend-name">{item.label}</span>
                  <strong className="legend-val">{info.count}</strong>
                  <span className="legend-sub">{formatBs(info.honorarios)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </article>

      {/* Gráfico 2: Cumplimiento Tributario */}
      <article className="chart-card">
        <header className="chart-header">
          <h3>Cumplimiento Tributario</h3>
          <span className="chart-total">DD.JJ. y EE.FF.</span>
        </header>

        <div className="compliance-stack">
          <div className="stack-block">
            <div className="stack-title-row">
              <span>Declaraciones Juradas</span>
              <span className="stack-counts">
                {compliance.ddjj.alDia} al día · {compliance.ddjj.pendiente} pend. ·{' '}
                {compliance.ddjj.observado} obs.
              </span>
            </div>
            <div className="stacked-bar" aria-label="Progreso Declaraciones Juradas">
              <div
                className="bar-seg seg-ok"
                style={{ width: pct(compliance.ddjj.alDia) }}
                title={`Al día: ${compliance.ddjj.alDia}`}
              />
              <div
                className="bar-seg seg-warn"
                style={{ width: pct(compliance.ddjj.pendiente) }}
                title={`Pendiente: ${compliance.ddjj.pendiente}`}
              />
              <div
                className="bar-seg seg-danger"
                style={{ width: pct(compliance.ddjj.observado) }}
                title={`Observado: ${compliance.ddjj.observado}`}
              />
            </div>
          </div>

          <div className="stack-block">
            <div className="stack-title-row">
              <span>Estados Financieros</span>
              <span className="stack-counts">
                {compliance.eeff.presentado} pres. · {compliance.eeff.proceso} proc. ·{' '}
                {compliance.eeff.pendiente} pend.
              </span>
            </div>
            <div className="stacked-bar" aria-label="Progreso Estados Financieros">
              <div
                className="bar-seg seg-ok"
                style={{ width: pct(compliance.eeff.presentado) }}
                title={`Presentado: ${compliance.eeff.presentado}`}
              />
              <div
                className="bar-seg seg-info"
                style={{ width: pct(compliance.eeff.proceso) }}
                title={`En proceso: ${compliance.eeff.proceso}`}
              />
              <div
                className="bar-seg seg-warn"
                style={{ width: pct(compliance.eeff.pendiente) }}
                title={`Pendiente: ${compliance.eeff.pendiente}`}
              />
              <div
                className="bar-seg seg-muted"
                style={{ width: pct(compliance.eeff.noAplica) }}
                title={`No aplica: ${compliance.eeff.noAplica}`}
              />
            </div>
          </div>

          <div className="stack-legend">
            <span><i className="dot seg-ok" /> Al día / Presentado</span>
            <span><i className="dot seg-info" /> En proceso</span>
            <span><i className="dot seg-warn" /> Pendiente</span>
            <span><i className="dot seg-danger" /> Observado</span>
          </div>
        </div>
      </article>

      {/* Gráfico 3: Honorarios por Mes de Cierre */}
      <article className="chart-card">
        <header className="chart-header">
          <h3>Honorarios por Cierre</h3>
          <span className="chart-total">{formatBs(summary.totalHonorariosActivos)} activos</span>
        </header>

        <div className="vbar-chart">
          {cierreBars.map((bar) => (
            <div key={bar.mes} className="vbar-col">
              <span className="vbar-amount">{bar.honorarios > 0 ? formatBs(bar.honorarios) : '—'}</span>
              <div className="vbar-track">
                <div
                  className="vbar-fill"
                  style={{ height: `${bar.heightPct}%` }}
                  title={`${bar.mes}: ${bar.count} cliente(s) · ${formatBs(bar.honorarios)}`}
                />
              </div>
              <span className="vbar-label">{bar.mes.slice(0, 3)}</span>
              <span className="vbar-count">{bar.count} cli.</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
