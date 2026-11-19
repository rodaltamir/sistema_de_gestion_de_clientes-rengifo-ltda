'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Eye,
  KeyRound,
  ShieldCheck,
  TrendingUp
} from 'lucide-react';
import { formatBs } from '@/lib/calculations';
import type { Client, FinancialSummary, Rubro } from '@/lib/types';

interface DashboardInsightsProps {
  clients: Client[];
  summary: FinancialSummary;
  siatExtReady: boolean;
  onOpenClient: (client: Client) => void;
  onOpenSiat: (client: Client) => void;
  onOpenSiatSetup: () => void;
  onFilterRubro: (rubro: Rubro) => void;
  onFilterDdjjPending: () => void;
  onGoDirectory: () => void;
}

const DUE_DAYS = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

const RUBRO_LABELS: Record<Rubro, string> = {
  profesional: 'Profesional',
  industrial: 'Industrial',
  alquiler: 'Alquiler',
  empresa: 'Empresa',
  unipersonal: 'Unipersonal',
  otro: 'Otro'
};

export default function DashboardInsights({
  clients,
  summary,
  siatExtReady,
  onOpenClient,
  onOpenSiat,
  onOpenSiatSetup,
  onFilterRubro,
  onFilterDdjjPending,
  onGoDirectory
}: DashboardInsightsProps) {
  const todayDay = new Date().getDate();
  const defaultDay = useMemo(() => {
    if (todayDay >= 13 && todayDay <= 22) return todayDay;
    if (todayDay < 13) return 13;
    return 13;
  }, [todayDay]);

  const [selectedDay, setSelectedDay] = useState<number>(defaultDay);

  const activeClients = useMemo(
    () => clients.filter((c) => c.estado === 'Activo'),
    [clients]
  );

  // Group active clients by fecha_pago (13..22)
  const dueByDay = useMemo(() => {
    const map: Record<number, { clients: Client[]; honorarios: number }> = {};
    for (const d of DUE_DAYS) map[d] = { clients: [], honorarios: 0 };

    for (const c of activeClients) {
      const day = Number(c.fecha_pago);
      if (day >= 13 && day <= 22) {
        map[day].clients.push(c);
        map[day].honorarios += Number(c.honorarios_profesionales || 0);
      }
    }
    return map;
  }, [activeClients]);

  const selectedDayInfo = dueByDay[selectedDay] || { clients: [], honorarios: 0 };

  // Data quality & alerts
  const quality = useMemo(() => {
    let sinCategoria = 0;
    let sinClaveSiat = 0;
    let sinCorreo = 0;
    let eeffPendientes = 0;
    let ddjjAtencion = 0;
    let completeScoreSum = 0;

    for (const c of clients) {
      if (c.rubro === 'otro') sinCategoria += 1;
      if (!c.contrasena_siat?.trim()) sinClaveSiat += 1;
      if (!c.correo?.trim()) sinCorreo += 1;
      if (c.estados_financieros === 'Pendiente') eeffPendientes += 1;
      if (c.declaraciones_juradas !== 'Al día') ddjjAtencion += 1;

      let checks = 0;
      if (c.nit?.trim()) checks += 1;
      if (c.correo?.trim()) checks += 1;
      if (c.contrasena_siat?.trim()) checks += 1;
      if (c.rubro !== 'otro') checks += 1;
      if (c.fecha_pago) checks += 1;
      completeScoreSum += checks / 5;
    }

    const completenessPct =
      clients.length > 0 ? Math.round((completeScoreSum / clients.length) * 100) : 0;

    return {
      sinCategoria,
      sinClaveSiat,
      sinCorreo,
      eeffPendientes,
      ddjjAtencion,
      completenessPct
    };
  }, [clients]);

  // Top active clients by honorarios
  const topClients = useMemo(() => {
    return [...activeClients]
      .sort((a, b) => Number(b.honorarios_profesionales || 0) - Number(a.honorarios_profesionales || 0))
      .slice(0, 6);
  }, [activeClients]);

  return (
    <section className="insights-grid" aria-label="Inteligencia de gestión y vencimientos">
      {/* 1. Calendario de Vencimientos Tributarios */}
      <article className="chart-card insight-card insight-card-wide">
        <header className="chart-header">
          <div className="insight-title-wrap">
            <CalendarClock size={18} className="insight-icon" aria-hidden="true" />
            <div>
              <h3>Vencimientos Tributarios (NIT)</h3>
              <p className="insight-sub">
                Hoy es día <strong>{todayDay}</strong> · Selecciona un día de pago (13 al 22)
              </p>
            </div>
          </div>
          <span className="chart-total">
            {selectedDayInfo.clients.length} clientes · {formatBs(selectedDayInfo.honorarios)}
          </span>
        </header>

        <div className="due-days-strip" role="tablist" aria-label="Días de vencimiento">
          {DUE_DAYS.map((day) => {
            const count = dueByDay[day].clients.length;
            const digit = (day - 13) % 10;
            const isToday = day === todayDay;
            const isSelected = day === selectedDay;
            return (
              <button
                key={day}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`due-day-pill ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}`}
                onClick={() => setSelectedDay(day)}
              >
                <span className="due-day-num">Día {day}</span>
                <span className="due-day-digit">NIT *{digit}</span>
                <strong className="due-day-count">{count}</strong>
              </button>
            );
          })}
        </div>

        <div className="insight-list">
          {selectedDayInfo.clients.length === 0 ? (
            <div className="insight-empty">
              No hay clientes activos con vencimiento el día {selectedDay}.
            </div>
          ) : (
            selectedDayInfo.clients.slice(0, 5).map((client) => (
              <div key={client.id} className="insight-row">
                <div className="insight-row-main">
                  <strong className="insight-row-title">{client.razon_social}</strong>
                  <span className="insight-row-meta">
                    NIT {client.nit} · {RUBRO_LABELS[client.rubro]} ·{' '}
                    {formatBs(client.honorarios_profesionales)}
                  </span>
                </div>
                <div className="insight-row-actions">
                  <button
                    type="button"
                    className="btn-xs"
                    onClick={() => onOpenClient(client)}
                  >
                    <Eye size={13} aria-hidden="true" />
                    Ficha
                  </button>
                  <button
                    type="button"
                    className="btn-xs btn-xs-siat"
                    onClick={() => onOpenSiat(client)}
                  >
                    <ExternalLink size={13} aria-hidden="true" />
                    SIAT
                  </button>
                </div>
              </div>
            ))
          )}
          {selectedDayInfo.clients.length > 5 && (
            <button type="button" className="insight-more-link" onClick={onGoDirectory}>
              Ver los {selectedDayInfo.clients.length} clientes del día {selectedDay} en el Directorio →
            </button>
          )}
        </div>
      </article>

      {/* 2. Salud del Padrón y Alertas */}
      <article className="chart-card insight-card">
        <header className="chart-header">
          <div className="insight-title-wrap">
            <AlertTriangle size={18} className="insight-icon" aria-hidden="true" />
            <div>
              <h3>Salud del Padrón y Alertas</h3>
              <p className="insight-sub">Calidad de datos y tareas pendientes</p>
            </div>
          </div>
          <span className="chart-total">{quality.completenessPct}% completo</span>
        </header>

        <div className="quality-progress-wrap">
          <div className="progress-track" aria-label={`Completitud del padrón ${quality.completenessPct}%`}>
            <div
              className="progress-seg seg-ok"
              style={{ width: `${quality.completenessPct}%` }}
            />
          </div>
        </div>

        <div className="alert-list">
          <button
            type="button"
            className="alert-item"
            onClick={() => onFilterRubro('otro')}
          >
            <span className="alert-label">Clientes sin categoría ("Otro")</span>
            <span className={`alert-badge ${quality.sinCategoria > 0 ? 'badge-warn' : 'badge-ok'}`}>
              {quality.sinCategoria}
            </span>
          </button>

          <button
            type="button"
            className="alert-item"
            onClick={onFilterDdjjPending}
          >
            <span className="alert-label">DD.JJ. pendientes u observadas</span>
            <span className={`alert-badge ${quality.ddjjAtencion > 0 ? 'badge-danger' : 'badge-ok'}`}>
              {quality.ddjjAtencion}
            </span>
          </button>

          <button
            type="button"
            className="alert-item"
            onClick={onGoDirectory}
          >
            <span className="alert-label">EE.FF. en estado Pendiente</span>
            <span className={`alert-badge ${quality.eeffPendientes > 0 ? 'badge-warn' : 'badge-ok'}`}>
              {quality.eeffPendientes}
            </span>
          </button>

          <button
            type="button"
            className="alert-item"
            onClick={onGoDirectory}
          >
            <span className="alert-label">Sin correo o sin Clave SIAT</span>
            <span
              className={`alert-badge ${
                quality.sinClaveSiat + quality.sinCorreo > 0 ? 'badge-danger' : 'badge-ok'
              }`}
            >
              {quality.sinClaveSiat} / {quality.sinCorreo}
            </span>
          </button>

          <button
            type="button"
            className="alert-item"
            onClick={onOpenSiatSetup}
          >
            <span className="alert-label">
              {siatExtReady ? (
                <span className="ext-status-inline ext-ok">
                  <ShieldCheck size={14} aria-hidden="true" />
                  Extensión Autocompletado SIAT activa
                </span>
              ) : (
                <span className="ext-status-inline ext-warn">
                  <KeyRound size={14} aria-hidden="true" />
                  Extensión SIAT pendiente de activar
                </span>
              )}
            </span>
            <span className={`alert-badge ${siatExtReady ? 'badge-ok' : 'badge-warn'}`}>
              {siatExtReady ? 'Lista' : 'Configurar'}
            </span>
          </button>
        </div>
      </article>

      {/* 3. Top Clientes por Honorarios & Ticket Promedio */}
      <article className="chart-card insight-card">
        <header className="chart-header">
          <div className="insight-title-wrap">
            <TrendingUp size={18} className="insight-icon" aria-hidden="true" />
            <div>
              <h3>Principales Clientes (Honorarios)</h3>
              <p className="insight-sub">
                Promedio activo: <strong>{formatBs(summary.promedioHonorariosActivos)}</strong> / mes
              </p>
            </div>
          </div>
          <span className="chart-total">Top {topClients.length}</span>
        </header>

        <div className="insight-list">
          {topClients.length === 0 ? (
            <div className="insight-empty">No hay clientes activos registrados.</div>
          ) : (
            topClients.map((client, idx) => (
              <div key={client.id} className="insight-row">
                <div className="insight-rank">{idx + 1}</div>
                <div className="insight-row-main">
                  <strong className="insight-row-title">{client.razon_social}</strong>
                  <span className="insight-row-meta">
                    NIT {client.nit} · Día {client.fecha_pago || '—'}
                  </span>
                </div>
                <strong className="insight-amount">
                  {formatBs(client.honorarios_profesionales)}
                </strong>
                <button
                  type="button"
                  className="btn-xs"
                  onClick={() => onOpenClient(client)}
                  title="Ver ficha"
                >
                  <CheckCircle2 size={13} aria-hidden="true" />
                  Ver
                </button>
              </div>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
