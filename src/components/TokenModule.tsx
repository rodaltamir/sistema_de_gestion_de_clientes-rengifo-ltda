'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Link2,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import {
  formatDisplayDate,
  getTokenExpiryStatus,
  parseTokenExcelFile,
  type ParsedTokenRow
} from '@/lib/token-excel-import';
import type { Client, ClientToken } from '@/lib/types';

interface TokenModuleProps {
  clients: Client[];
  initialSearch?: string;
  onClearInitialSearch?: () => void;
  onOpenClientById: (clientId: number) => void;
  onTokensChanged: () => void;
  showToast: (msg: string) => void;
  copyText: (text: string, label: string) => void;
}

const EMPTY_TOKEN_FORM: Omit<ClientToken, 'id'> = {
  client_id: null,
  nombre_cliente: '',
  modalidad_asignada: '',
  grupo: '',
  fecha_adecuacion: '',
  vigencia_token: '',
  vigencia_firma: '',
  correo_electronico: '',
  clave_correo: '',
  contrasena_outlook: '',
  contrasena_gmail: '',
  contrasena_digicert: ''
};

export default function TokenModule({
  clients,
  initialSearch = '',
  onClearInitialSearch,
  onOpenClientById,
  onTokensChanged,
  showToast,
  copyText
}: TokenModuleProps) {
  const [tokens, setTokens] = useState<ClientToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'warn' | 'danger' | 'neutral'>('all');
  const [modalityFilter, setModalityFilter] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<Record<number, boolean>>({});

  // Form modal
  const formDialogRef = useRef<HTMLDialogElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formState, setFormState] = useState<Omit<ClientToken, 'id'>>(EMPTY_TOKEN_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Import modal
  const importDialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows] = useState<ParsedTokenRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importExpanded, setImportExpanded] = useState(false);

  useEffect(() => {
    if (initialSearch) {
      setQ(initialSearch);
      onClearInitialSearch?.();
    }
  }, [initialSearch, onClearInitialSearch]);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tokens', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setTokens(data.tokens || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const clientNameSet = useMemo(() => {
    const map = new Map<string, Client>();
    for (const c of clients) {
      map.set(c.razon_social.trim().toLowerCase(), c);
    }
    return map;
  }, [clients]);

  const stats = useMemo(() => {
    let ok = 0;
    let warn = 0;
    let danger = 0;
    let linked = 0;

    for (const t of tokens) {
      if (t.client_id) linked++;
      const st = getTokenExpiryStatus(t.vigencia_token || t.vigencia_firma);
      if (st.tone === 'ok') ok++;
      else if (st.tone === 'warn') warn++;
      else if (st.tone === 'danger') danger++;
    }

    return { total: tokens.length, ok, warn, danger, linked };
  }, [tokens]);

  const filteredTokens = useMemo(() => {
    const query = q.trim().toLowerCase();
    return tokens.filter((t) => {
      if (query) {
        const hay = [
          t.nombre_cliente,
          t.client_nit || '',
          t.correo_electronico,
          t.modalidad_asignada
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }

      if (modalityFilter) {
        if (!t.modalidad_asignada.toUpperCase().includes(modalityFilter)) return false;
      }

      if (statusFilter !== 'all') {
        const st = getTokenExpiryStatus(t.vigencia_token || t.vigencia_firma);
        if (st.tone !== statusFilter) return false;
      }

      return true;
    });
  }, [tokens, q, modalityFilter, statusFilter]);

  function openCreateModal() {
    setEditingId(null);
    setFormState({ ...EMPTY_TOKEN_FORM, nombre_cliente: q.trim() || '' });
    setFormError('');
    formDialogRef.current?.showModal();
  }

  function openEditModal(token: ClientToken) {
    setEditingId(token.id);
    setFormState({
      client_id: token.client_id,
      nombre_cliente: token.nombre_cliente,
      modalidad_asignada: token.modalidad_asignada,
      grupo: '',
      fecha_adecuacion: token.fecha_adecuacion,
      vigencia_token: token.vigencia_token,
      vigencia_firma: token.vigencia_firma,
      correo_electronico: token.correo_electronico,
      clave_correo: token.clave_correo || token.contrasena_gmail || token.contrasena_outlook || '',
      contrasena_outlook: '',
      contrasena_gmail: token.clave_correo || token.contrasena_gmail || token.contrasena_outlook || '',
      contrasena_digicert: token.contrasena_digicert
    });
    setFormError('');
    formDialogRef.current?.showModal();
  }

  async function handleSaveForm(e: React.FormEvent) {
    e.preventDefault();
    if (!formState.nombre_cliente.trim()) {
      setFormError('El nombre del cliente es obligatorio.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const url = editingId ? `/api/tokens/${editingId}` : '/api/tokens';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState)
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'No se pudo guardar el registro.');
        return;
      }
      formDialogRef.current?.close();
      await loadTokens();
      onTokensChanged();
      showToast(editingId ? 'Registro de token actualizado.' : 'Registro de token guardado.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteToken(token: ClientToken) {
    if (!confirm(`¿Eliminar el registro de token de "${token.nombre_cliente}"?`)) return;
    const res = await fetch(`/api/tokens/${token.id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadTokens();
      onTokensChanged();
      showToast('Registro eliminado.');
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportFileName(file.name);
    try {
      const parsed = await parseTokenExcelFile(file);
      if (parsed.length === 0) {
        setImportError('No se encontraron filas con datos en el archivo.');
        setImportRows([]);
        return;
      }
      setImportRows(parsed);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Error al leer el archivo Excel.');
      setImportRows([]);
    }
    e.target.value = '';
  }

  function updateImportRow<K extends keyof ParsedTokenRow>(
    idx: number,
    field: K,
    value: ParsedTokenRow[K]
  ) {
    setImportRows((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  }

  async function handleConfirmImport() {
    if (importRows.length === 0) return;
    setImporting(true);
    setImportError('');
    try {
      const res = await fetch('/api/tokens/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: importRows })
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || 'Error al importar registros.');
        return;
      }
      importDialogRef.current?.close();
      setImportRows([]);
      setImportFileName('');
      await loadTokens();
      onTokensChanged();
      showToast(
        `Importación completada: ${data.inserted} nuevos, ${data.updated} actualizados (${data.linked} vinculados a clientes).`
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <div className="module-header-bar">
        <div>
          <h1 className="module-title">Vigencia de Token y Firma Digital</h1>
          <p className="module-subtitle">
            Control de modalidad de facturación, vencimientos de token/firma, correo y clave Digicert
          </p>
        </div>
        <div className="module-quick-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setImportError('');
              importDialogRef.current?.showModal();
            }}
          >
            <Upload size={16} aria-hidden="true" />
            Importar Excel (Celestes)
          </button>
          <button type="button" className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={16} aria-hidden="true" />
            Nuevo registro
          </button>
        </div>
      </div>

      {/* KPIs */}
      <section className="kpi-strip" aria-label="Resumen de tokens y firma digital">
        <button
          type="button"
          className={`kpi-card ${statusFilter === 'all' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <span className="kpi-label">Total registros</span>
          <strong className="kpi-value">{stats.total}</strong>
        </button>
        <button
          type="button"
          className={`kpi-card ${statusFilter === 'ok' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('ok')}
        >
          <span className="kpi-label">Vigentes</span>
          <strong className="kpi-value kpi-ok">{stats.ok}</strong>
        </button>
        <button
          type="button"
          className={`kpi-card ${statusFilter === 'warn' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('warn')}
        >
          <span className="kpi-label">Por vencer (≤ 30d)</span>
          <strong className="kpi-value kpi-warn">{stats.warn}</strong>
        </button>
        <button
          type="button"
          className={`kpi-card ${statusFilter === 'danger' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('danger')}
        >
          <span className="kpi-label">Vencidos</span>
          <strong className="kpi-value kpi-danger">{stats.danger}</strong>
        </button>
        <div className="kpi-card">
          <span className="kpi-label">Vinculados al padrón</span>
          <strong className="kpi-value kpi-accent">{stats.linked}</strong>
        </div>
      </section>

      {/* Filtros */}
      <section className="filter-panel" aria-label="Búsqueda de tokens">
        <div className="search-row">
          <div className="search-input-wrap">
            <Search size={17} className="search-icon" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por cliente, NIT, correo o modalidad..."
            />
          </div>
          {q && (
            <button type="button" className="btn btn-ghost" onClick={() => setQ('')}>
              <X size={15} aria-hidden="true" />
              Limpiar
            </button>
          )}
        </div>

        <div className="quick-filters">
          <div className="pill-group" role="group" aria-label="Modalidad asignada">
            <span className="pill-label">Modalidad:</span>
            {['', 'COMPUTARIZADA', 'ELECTRÓNICA', 'PORTAL WEB'].map((mod) => (
              <button
                key={mod || 'all'}
                type="button"
                className={`pill ${modalityFilter === mod ? 'is-active' : ''}`}
                onClick={() => setModalityFilter(mod)}
              >
                {mod || 'Todas'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Tabla principal */}
      <section className="table-card" aria-label="Listado de tokens y firma digital">
        <div className="table-wrapper">
          <table id="tokens-table">
            <thead>
              <tr>
                <th>Cliente / Vínculo</th>
                <th>Modalidad</th>
                <th>F. Adecuación</th>
                <th>Vigencia Token</th>
                <th>Vigencia Firma</th>
                <th>Correo Electrónico</th>
                <th>Clave Correo</th>
                <th>Clave Digicert</th>
                <th className="actions-col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>
                    Cargando registros de tokens...
                  </td>
                </tr>
              ) : filteredTokens.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem' }}>
                    No hay registros de tokens que coincidan. Usa{' '}
                    <strong>Importar Excel (Celestes)</strong> para cargar tu archivo.
                  </td>
                </tr>
              ) : (
                filteredTokens.map((token) => {
                  const tokenStatus = getTokenExpiryStatus(token.vigencia_token);
                  const firmaStatus = getTokenExpiryStatus(token.vigencia_firma);
                  const isRevealed = Boolean(revealedKeys[token.id]);
                  const emailPass =
                    token.clave_correo || token.contrasena_gmail || token.contrasena_outlook || '';

                  return (
                    <tr key={token.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <strong>{token.nombre_cliente}</strong>
                          {token.client_id ? (
                            <button
                              type="button"
                              className="token-link-btn"
                              onClick={() => onOpenClientById(token.client_id!)}
                            >
                              <Link2 size={12} aria-hidden="true" />
                              NIT {token.client_nit || '—'} · Ver ficha
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.73rem', color: 'var(--ink-muted)' }}>
                              Sin vincular en padrón
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="token-mod-badge">
                          {token.modalidad_asignada || 'Sin modalidad'}
                        </span>
                      </td>
                      <td className="mono-copy">{formatDisplayDate(token.fecha_adecuacion)}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span className="mono-copy">{formatDisplayDate(token.vigencia_token)}</span>
                          <span className={`token-status-pill tone-${tokenStatus.tone}`}>
                            {tokenStatus.label}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span className="mono-copy">{formatDisplayDate(token.vigencia_firma)}</span>
                          <span className={`token-status-pill tone-${firmaStatus.tone}`}>
                            {firmaStatus.label}
                          </span>
                        </div>
                      </td>
                      <td>
                        {token.correo_electronico ? (
                          <span className="mono-copy">
                            <span className="truncate-email">{token.correo_electronico}</span>
                            <button
                              type="button"
                              className="btn-copy-inline"
                              onClick={() => copyText(token.correo_electronico, 'Correo')}
                              title="Copiar correo"
                            >
                              <Copy size={13} aria-hidden="true" />
                            </button>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {emailPass ? (
                          <span className="secret-box">
                            <span className="mono-copy">{isRevealed ? emailPass : '••••••'}</span>
                            <button
                              type="button"
                              className="btn-copy-inline"
                              onClick={() =>
                                setRevealedKeys((prev) => ({ ...prev, [token.id]: !prev[token.id] }))
                              }
                              title={isRevealed ? 'Ocultar clave' : 'Ver clave'}
                            >
                              {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            <button
                              type="button"
                              className="btn-copy-inline"
                              onClick={() => copyText(emailPass, 'Clave correo')}
                              title="Copiar clave correo"
                            >
                              <Copy size={13} aria-hidden="true" />
                            </button>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {token.contrasena_digicert ? (
                          <span className="secret-box">
                            <span className="mono-copy">
                              {isRevealed ? token.contrasena_digicert : '••••••'}
                            </span>
                            <button
                              type="button"
                              className="btn-copy-inline"
                              onClick={() =>
                                copyText(token.contrasena_digicert, 'Clave Digicert')
                              }
                              title="Copiar clave Digicert"
                            >
                              <Copy size={13} aria-hidden="true" />
                            </button>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="actions-col">
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditModal(token)}
                          >
                            <Pencil size={13} aria-hidden="true" />
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleDeleteToken(token)}
                            title="Eliminar"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal: Importar Excel (Solo columnas celestes, sin Grupo, Clave Correo unificada) */}
      <dialog
        ref={importDialogRef}
        className={`dialog-panel dialog-import ${importExpanded ? 'is-expanded' : ''}`}
      >
        <div className="dialog-header">
          <div>
            <h2>Importar Vigencia de Token y Firma Digital</h2>
            <p className="dialog-subtitle">
              Columnas celestes editables: Nombre, Modalidad, Adecuación, Token, Firma Digital, Correo, Clave Correo (Outlook/Gmail) y Clave Digicert. Se omiten Grupo y columnas azules.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setImportExpanded((v) => !v)}
              title={importExpanded ? 'Contraer ventana' : 'Ampliar ventana'}
            >
              {importExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              {importExpanded ? 'Contraer' : 'Ampliar'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => importDialogRef.current?.close()}
              aria-label="Cerrar"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="dialog-body" style={{ display: 'grid', gap: '0.85rem' }}>
          <div className="import-dropzone" style={{ padding: '0.9rem 1.1rem', flexDirection: 'row', justifyContent: 'space-between' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="visually-hidden"
              onChange={handleFileSelect}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet size={16} aria-hidden="true" />
                {importFileName ? 'Cambiar archivo Excel' : 'Seleccionar archivo Excel (.xlsx)'}
              </button>
              {importFileName && (
                <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--ink)' }}>
                  {importFileName}
                </span>
              )}
            </div>
            {importRows.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="token-status-pill tone-ok">
                  Filas: {importRows.length}
                </span>
                <span className="token-status-pill tone-neutral">
                  Vinculados:{' '}
                  {
                    importRows.filter((r) =>
                      clientNameSet.has(r.nombre_cliente.trim().toLowerCase())
                    ).length
                  }
                </span>
              </div>
            )}
          </div>

          {importError && <div className="form-error">{importError}</div>}

          {importRows.length > 0 && (
            <div className="import-preview-wrap">
              <table className="import-preview-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Vínculo</th>
                    <th>Nombre / Razón Social</th>
                    <th>Modalidad</th>
                    <th>Adecuación</th>
                    <th>Vig. Token</th>
                    <th>Vig. Firma</th>
                    <th>Correo</th>
                    <th>Clave Correo</th>
                    <th>Clave Digicert</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row, idx) => {
                    const matched = clientNameSet.has(row.nombre_cliente.trim().toLowerCase());
                    return (
                      <tr key={`${row.rowIndex}-${idx}`}>
                        <td>{row.rowIndex}</td>
                        <td>
                          <span className={`token-status-pill ${matched ? 'tone-ok' : 'tone-neutral'}`}>
                            {matched ? 'Cliente ✓' : 'Solo Token'}
                          </span>
                        </td>
                        <td>
                          <input
                            type="text"
                            className="import-cell-input"
                            style={{ minWidth: '175px' }}
                            value={row.nombre_cliente}
                            onChange={(e) => updateImportRow(idx, 'nombre_cliente', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="import-cell-input"
                            style={{ minWidth: '120px' }}
                            value={row.modalidad_asignada}
                            onChange={(e) =>
                              updateImportRow(idx, 'modalidad_asignada', e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="import-cell-input"
                            value={row.fecha_adecuacion}
                            onChange={(e) =>
                              updateImportRow(idx, 'fecha_adecuacion', e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="import-cell-input"
                            value={row.vigencia_token}
                            onChange={(e) => updateImportRow(idx, 'vigencia_token', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="import-cell-input"
                            value={row.vigencia_firma}
                            onChange={(e) => updateImportRow(idx, 'vigencia_firma', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="email"
                            className="import-cell-input"
                            style={{ minWidth: '170px' }}
                            value={row.correo_electronico}
                            onChange={(e) =>
                              updateImportRow(idx, 'correo_electronico', e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="import-cell-input"
                            style={{ minWidth: '110px' }}
                            value={row.clave_correo}
                            onChange={(e) => updateImportRow(idx, 'clave_correo', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="import-cell-input"
                            style={{ minWidth: '110px' }}
                            value={row.contrasena_digicert}
                            onChange={(e) =>
                              updateImportRow(idx, 'contrasena_digicert', e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setImportRows((prev) => prev.filter((_, i) => i !== idx))
                            }
                            title="Quitar fila"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="dialog-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => importDialogRef.current?.close()}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={importing || importRows.length === 0}
            onClick={handleConfirmImport}
          >
            <Check size={16} aria-hidden="true" />
            {importing ? 'Importando...' : `Confirmar importación (${importRows.length})`}
          </button>
        </footer>
      </dialog>

      {/* Modal: Crear / Editar registro de Token */}
      <dialog ref={formDialogRef} className="dialog-panel dialog-siat">
        <div className="dialog-header">
          <div>
            <h2>{editingId ? 'Editar Token y Firma Digital' : 'Nuevo Registro de Token'}</h2>
            <p className="dialog-subtitle">
              Se vinculará automáticamente con el cliente si coincide el nombre o razón social.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => formDialogRef.current?.close()}
            aria-label="Cerrar"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSaveForm}>
          <div className="dialog-body form-grid">
            {formError && <div className="form-error">{formError}</div>}

            <label className="field span-2">
              <span>Nombre / Razón Social *</span>
              <input
                type="text"
                required
                list="clientes-token-list"
                value={formState.nombre_cliente}
                onChange={(e) => setFormState({ ...formState, nombre_cliente: e.target.value })}
              />
              <datalist id="clientes-token-list">
                {clients.map((c) => (
                  <option key={c.id} value={c.razon_social} />
                ))}
              </datalist>
            </label>

            <label className="field">
              <span>Modalidad asignada</span>
              <input
                type="text"
                placeholder="COMPUTARIZADA / ELECTRÓNICA / PORTAL WEB"
                value={formState.modalidad_asignada}
                onChange={(e) =>
                  setFormState({ ...formState, modalidad_asignada: e.target.value })
                }
              />
            </label>

            <label className="field">
              <span>Fecha de adecuación</span>
              <input
                type="date"
                value={formState.fecha_adecuacion}
                onChange={(e) => setFormState({ ...formState, fecha_adecuacion: e.target.value })}
              />
            </label>

            <label className="field">
              <span>Vigencia Token</span>
              <input
                type="date"
                value={formState.vigencia_token}
                onChange={(e) => setFormState({ ...formState, vigencia_token: e.target.value })}
              />
            </label>

            <label className="field">
              <span>Vigencia Firma Digital</span>
              <input
                type="date"
                value={formState.vigencia_firma}
                onChange={(e) => setFormState({ ...formState, vigencia_firma: e.target.value })}
              />
            </label>

            <label className="field span-2">
              <span>Correo electrónico</span>
              <input
                type="email"
                value={formState.correo_electronico}
                onChange={(e) =>
                  setFormState({ ...formState, correo_electronico: e.target.value })
                }
              />
            </label>

            <label className="field">
              <span>Clave Correo (Outlook / Gmail)</span>
              <input
                type="text"
                value={formState.clave_correo || ''}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    clave_correo: e.target.value,
                    contrasena_gmail: e.target.value
                  })
                }
              />
            </label>

            <label className="field">
              <span>Clave Digicert</span>
              <input
                type="text"
                value={formState.contrasena_digicert}
                onChange={(e) =>
                  setFormState({ ...formState, contrasena_digicert: e.target.value })
                }
              />
            </label>
          </div>

          <footer className="dialog-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => formDialogRef.current?.close()}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
