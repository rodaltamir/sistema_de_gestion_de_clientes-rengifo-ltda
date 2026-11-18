'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Briefcase,
  Building,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Factory,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  KeyRound,
  Layers,
  LogOut,
  PauseCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  Wallet,
  X,
  XCircle
} from 'lucide-react';
import DashboardCharts from './DashboardCharts';
import { calculateFinancialSummary, formatBs, getFechaPagoFromNit } from '@/lib/calculations';
import { parseExcelClientsFile } from '@/lib/excel-import';
import { exportClientsToPdf, exportSingleClientPdf } from '@/lib/pdf-export';
import type {
  Client,
  ClientEstado,
  ClientHistoryRecord,
  ClientStats,
  Rubro,
  User
} from '@/lib/types';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

const RUBRO_OPTIONS: Array<{ value: Rubro; label: string; icon: React.ReactNode }> = [
  { value: 'profesional', label: 'Profesional', icon: <Briefcase size={16} aria-hidden="true" /> },
  { value: 'industrial', label: 'Industrial', icon: <Factory size={16} aria-hidden="true" /> },
  { value: 'alquiler', label: 'Alquiler', icon: <Building size={16} aria-hidden="true" /> },
  { value: 'empresa', label: 'Empresa', icon: <Building2 size={16} aria-hidden="true" /> },
  { value: 'unipersonal', label: 'Unipersonal', icon: <UserCheck size={16} aria-hidden="true" /> },
  { value: 'otro', label: 'Otro', icon: <Layers size={16} aria-hidden="true" /> }
];

const CI_EXTENSIONS = [
  { value: 'LP', label: 'LP - La Paz' },
  { value: 'CB', label: 'CB - Cochabamba' },
  { value: 'SC', label: 'SC - Santa Cruz' },
  { value: 'OR', label: 'OR - Oruro' },
  { value: 'PT', label: 'PT - Potosí' },
  { value: 'TJ', label: 'TJ - Tarija' },
  { value: 'CH', label: 'CH - Chuquisaca' },
  { value: 'BE', label: 'BE - Beni' },
  { value: 'PD', label: 'PD - Pando' },
  { value: 'EX', label: 'EX - Extranjero' }
];

const ESTADO_OPTIONS: Array<{ value: ClientEstado; label: string; icon: React.ReactNode }> = [
  { value: 'Activo', label: 'Activo', icon: <CheckCircle2 size={16} aria-hidden="true" /> },
  {
    value: 'Inactivo / Suspendido',
    label: 'Suspendido',
    icon: <PauseCircle size={16} aria-hidden="true" />
  },
  { value: 'Baja', label: 'De baja', icon: <XCircle size={16} aria-hidden="true" /> }
];

const CIERRE_OPTIONS = ['Marzo', 'Junio', 'Septiembre', 'Diciembre'];

const RUBRO_LABELS: Record<Rubro, string> = {
  profesional: 'Profesional',
  industrial: 'Industrial',
  alquiler: 'Alquiler',
  empresa: 'Empresa',
  unipersonal: 'Unipersonal',
  otro: 'Otro'
};

type SortKey =
  | 'razon_social'
  | 'nit'
  | 'correo'
  | 'rubro'
  | 'fecha_ingreso'
  | 'estado';

interface ClientDashboardProps {
  user: User;
  onLoggedOut: () => void;
}

const EMPTY_FORM: Omit<Client, 'id'> = {
  razon_social: '',
  nit: '',
  fecha_ingreso: new Date().toISOString().slice(0, 10),
  fecha_baja: '',
  fecha_inactivacion: '',
  direccion: '',
  correo: '',
  contrasena_correo: '',
  contrasena_siat: '',
  rubro: 'profesional',
  rubro_especifico: '',
  ci_numero: '',
  ci_extension: '',
  fecha_pago: '',
  mes_cierre: 'Diciembre',
  honorarios_profesionales: 0,
  declaraciones_juradas: 'Al día',
  estados_financieros: 'Pendiente',
  dictamen: 'No aplica',
  saldo_iva: 0,
  saldo_it: 0,
  celular: '',
  estado: 'Activo',
  notas: ''
};

function CopyButton({
  value,
  label,
  onCopy
}: {
  value: string;
  label: string;
  onCopy: (text: string, label: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  return (
    <button
      type="button"
      className={`btn-copy-inline ${copied ? 'is-copied' : ''}`}
      title={`Copiar ${label}`}
      aria-label={`Copiar ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onCopy(value, label);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}

export default function ClientDashboard({ user, onLoggedOut }: ClientDashboardProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [stats, setStats] = useState<ClientStats>({
    total: 0,
    activos: 0,
    inactivos: 0,
    bajas: 0,
    ddjj_pendientes: 0
  });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  // Filters
  const [q, setQ] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterRubro, setFilterRubro] = useState('');
  const [filterMesCierre, setFilterMesCierre] = useState('');
  const [filterDdjj, setFilterDdjj] = useState('');
  const [filterEeff, setFilterEeff] = useState('');
  const [filterDictamen, setFilterDictamen] = useState('');
  const [quickDdjjPending, setQuickDdjjPending] = useState(false);

  // Time Filters & UI toggles
  const [campoFecha, setCampoFecha] = useState('historico');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [timePreset, setTimePreset] = useState<'all' | 'month' | 'quarter' | 'year'>('all');
  const [showCharts, setShowCharts] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('razon_social');
  const [sortDir, setSortDir] = useState<'ascending' | 'descending'>('ascending');

  // Detail & Form Dialogs
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [detailTab, setDetailTab] = useState<'general' | 'history'>('general');
  const [showPassCorreo, setShowPassCorreo] = useState(false);
  const [showPassSiat, setShowPassSiat] = useState(false);

  // Client History State
  const [historyRecords, setHistoryRecords] = useState<ClientHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [newRecord, setNewRecord] = useState({
    fecha_registro: new Date().toISOString().slice(0, 10),
    tipo_evento: 'Declaración Jurada',
    estado_pago: 'Pagado' as 'Pagado' | 'Pendiente' | 'Observado',
    monto_honorarios: 0,
    saldo_iva: 0,
    saldo_it: 0,
    formularios: '',
    observaciones: ''
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [formState, setFormState] = useState<Omit<Client, 'id'>>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const detailDialogRef = useRef<HTMLDialogElement>(null);
  const formDialogRef = useRef<HTMLDialogElement>(null);
  const importDialogRef = useRef<HTMLDialogElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Excel Import State
  const [importTab, setImportTab] = useState<'new' | 'history'>('new');
  const [importFileName, setImportFileName] = useState('');
  const [importParsedRows, setImportParsedRows] = useState<Array<Record<string, unknown>>>([]);
  const [importPreview, setImportPreview] = useState<
    Array<{
      rowNumber: number;
      status: 'new' | 'duplicate_db' | 'duplicate_file' | 'invalid';
      reason: string;
      data: Record<string, unknown>;
    }>
  >([]);
  const [importCounts, setImportCounts] = useState({
    new: 0,
    duplicate_db: 0,
    duplicate_file: 0,
    invalid: 0
  });
  const [importDuplicateAction, setImportDuplicateAction] = useState<'skip' | 'update'>('skip');
  const [importYear, setImportYear] = useState<number>(new Date().getFullYear());
  const [importMonth, setImportMonth] = useState<number>(new Date().getMonth() + 1);
  const [importRecordHistory, setImportRecordHistory] = useState(true);
  const [importBatches, setImportBatches] = useState<
    Array<{
      id: number;
      archivo: string;
      periodo: string;
      anio: number;
      mes: string;
      fecha_periodo: string;
      nuevos: number;
      actualizados: number;
      total_filas: number;
      created_at: string;
    }>
  >([]);
  const [importBatchYearFilter, setImportBatchYearFilter] = useState<string>('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2200);
  }, []);

  const copyText = useCallback(
    async (text: string, label: string) => {
      if (!text) {
        showToast(`Sin ${label.toLowerCase()} registrado.`);
        return;
      }

      let ok = false;
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text);
          ok = true;
        } catch {
          ok = false;
        }
      }

      if (!ok) {
        // Fallback that works on http:// and inside top-layer <dialog showModal()>
        const container = document.querySelector('dialog[open]') || document.body;
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.pointerEvents = 'none';
        container.appendChild(ta);
        ta.focus();
        ta.select();
        try {
          ok = document.execCommand('copy');
        } catch {
          ok = false;
        }
        container.removeChild(ta);
      }

      showToast(ok ? `${label} copiado` : 'No se pudo copiar.');
    },
    [showToast]
  );

  const buildFilterQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (filterEstado) params.set('estado', filterEstado);
    if (filterRubro) params.set('rubro', filterRubro);
    if (filterMesCierre) params.set('mes_cierre', filterMesCierre);
    if (filterDdjj) params.set('declaraciones_juradas', filterDdjj);
    if (filterEeff) params.set('estados_financieros', filterEeff);
    if (filterDictamen) params.set('dictamen', filterDictamen);
    if (fechaDesde) params.set('fecha_desde', fechaDesde);
    if (fechaHasta) params.set('fecha_hasta', fechaHasta);
    if (fechaDesde || fechaHasta) params.set('campo_fecha', campoFecha);
    return params.toString();
  }, [
    q,
    filterEstado,
    filterRubro,
    filterMesCierre,
    filterDdjj,
    filterEeff,
    filterDictamen,
    fechaDesde,
    fechaHasta,
    campoFecha
  ]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildFilterQuery();
      const res = await fetch(`/api/clients${qs ? `?${qs}` : ''}`);
      if (res.status === 401) {
        onLoggedOut();
        return;
      }
      const data = await res.json();
      let list: Client[] = data.clients || [];
      if (quickDdjjPending) {
        list = list.filter((c) => c.estado === 'Activo' && c.declaraciones_juradas !== 'Al día');
      }
      setClients(list);
      if (data.stats) setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }, [buildFilterQuery, quickDdjjPending, onLoggedOut]);

  useEffect(() => {
    const timer = setTimeout(fetchClients, 150);
    const advancedFilterCount = [
    filterMesCierre,
    filterDdjj,
    filterEeff,
    filterDictamen,
    fechaDesde,
    fechaHasta
  ].filter(Boolean).length;

  return () => clearTimeout(timer);
  }, [fetchClients]);

  // Ctrl+K shortcut to focus search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const advancedFilterCount = [
    filterMesCierre,
    filterDdjj,
    filterEeff,
    filterDictamen,
    fechaDesde,
    fechaHasta
  ].filter(Boolean).length;

  return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Light-dismiss fallback for browsers without <dialog closedby="any">
  useEffect(() => {
    const dialog = detailDialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close();
    };
    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    const advancedFilterCount = [
    filterMesCierre,
    filterDdjj,
    filterEeff,
    filterDictamen,
    fechaDesde,
    fechaHasta
  ].filter(Boolean).length;

  return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, []);

  const sortedClients = useMemo(() => {
    const factor = sortDir === 'ascending' ? 1 : -1;
    return [...clients].sort((a, b) => {
      const va =
        sortKey === 'rubro'
          ? RUBRO_LABELS[a.rubro] || a.rubro
          : String(a[sortKey] || '');
      const vb =
        sortKey === 'rubro'
          ? RUBRO_LABELS[b.rubro] || b.rubro
          : String(b[sortKey] || '');
      return factor * collator.compare(va, vb);
    });
  }, [clients, sortKey, sortDir]);

  const financialSummary = useMemo(
    () => calculateFinancialSummary(sortedClients),
    [sortedClients]
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'ascending' ? 'descending' : 'ascending'));
    } else {
      setSortKey(key);
      setSortDir('ascending');
    }
  }

  function applyTimePreset(preset: 'all' | 'month' | 'quarter' | 'year') {
    setTimePreset(preset);
    if (preset === 'all') {
      setFechaDesde('');
      setFechaHasta('');
      return;
    }
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    let fromDate: Date;
    if (preset === 'month') {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === 'quarter') {
      fromDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    } else {
      fromDate = new Date(now.getFullYear(), 0, 1);
    }
    setFechaDesde(fromDate.toISOString().slice(0, 10));
    setFechaHasta(to);
  }

  function clearFilters() {
    setQ('');
    setFilterEstado('');
    setFilterRubro('');
    setFilterMesCierre('');
    setFilterDdjj('');
    setFilterEeff('');
    setFilterDictamen('');
    setQuickDdjjPending(false);
    setFechaDesde('');
    setFechaHasta('');
    setTimePreset('all');
  }

  const hasActiveFilters = Boolean(
    q.trim() ||
      filterEstado ||
      filterRubro ||
      filterMesCierre ||
      filterDdjj ||
      filterEeff ||
      filterDictamen ||
      quickDdjjPending ||
      fechaDesde ||
      fechaHasta
  );

  const loadClientHistory = useCallback(async (clientId: number, from = '', to = '') => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/clients/${clientId}/history?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryRecords(data.records || []);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  function openDetail(client: Client) {
    setSelectedClient(client);
    setDetailTab('general');
    setShowPassCorreo(false);
    setShowPassSiat(false);
    setShowHistoryForm(false);
    setHistoryFrom('');
    setHistoryTo('');
    setNewRecord({
      fecha_registro: new Date().toISOString().slice(0, 10),
      tipo_evento: 'Declaración Jurada',
      estado_pago: 'Pagado',
      monto_honorarios: client.honorarios_profesionales || 0,
      saldo_iva: client.saldo_iva || 0,
      saldo_it: client.saldo_it || 0,
      formularios: 'Form. 200 (IVA), Form. 400 (IT)',
      observaciones: ''
    });
    loadClientHistory(client.id);
    detailDialogRef.current?.showModal();
  }

  async function handleAddHistoryRecord(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedClient) return;
    const res = await fetch(`/api/clients/${selectedClient.id}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRecord)
    });
    if (res.ok) {
      setShowHistoryForm(false);
      showToast('Registro histórico guardado.');
      await loadClientHistory(selectedClient.id, historyFrom, historyTo);
    } else {
      const err = await res.json();
      showToast(err.error || 'No se pudo guardar.');
    }
  }

  async function handleDeleteHistoryRecord(recordId: number) {
    if (!selectedClient) return;
    const res = await fetch(
      `/api/clients/${selectedClient.id}/history?recordId=${recordId}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      showToast('Registro eliminado.');
      await loadClientHistory(selectedClient.id, historyFrom, historyTo);
    }
  }

  function openCreateForm() {
    setEditingId(null);
    setFormState({ ...EMPTY_FORM, fecha_ingreso: new Date().toISOString().slice(0, 10) });
    setFormError('');
    formDialogRef.current?.showModal();
  }

  function openEditForm(client: Client) {
    detailDialogRef.current?.close();
    setEditingId(client.id);
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = client;
    setFormState(rest);
    setFormError('');
    formDialogRef.current?.showModal();
  }

  async function handleSaveClient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      const firstInvalid = form.querySelector<HTMLElement>(':invalid');
      firstInvalid?.focus();
      setFormError('Completa los campos obligatorios marcados con *.');
      return;
    }

    setSaving(true);
    try {
      const url = editingId ? `/api/clients/${editingId}` : '/api/clients';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState)
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Error al guardar cliente.');
        return;
      }
      formDialogRef.current?.close();
      showToast(editingId ? 'Cliente actualizado.' : 'Cliente registrado.');
      await fetchClients();
    } catch {
      setFormError('Error de conexión con el servidor.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClient(client: Client) {
    const ok = window.confirm(
      `¿Eliminar definitivamente al cliente "${client.razon_social}" (NIT ${client.nit})?`
    );
    if (!ok) return;

    const res = await fetch(`/api/clients/${client.id}`, { method: 'DELETE' });
    if (res.ok) {
      detailDialogRef.current?.close();
      showToast('Cliente eliminado.');
      await fetchClients();
    } else {
      showToast('No se pudo eliminar.');
    }
  }

  function handleExportExcel() {
    const qs = buildFilterQuery();
    window.location.href = `/api/clients/export/excel${qs ? `?${qs}` : ''}`;
    showToast('Descargando Excel...');
  }

  function handleExportPdf() {
    if (sortedClients.length === 0) {
      showToast('Sin clientes para exportar.');
      return;
    }
    exportClientsToPdf(sortedClients, financialSummary);
    showToast('PDF generado.');
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    onLoggedOut();
  }

  const estadoClass = (estado: string) => {
    if (estado === 'Activo') return 'badge-ok';
    if (estado === 'Inactivo / Suspendido') return 'badge-warn';
    if (estado === 'Baja') return 'badge-danger';
    return 'badge-neutral';
  };

  const ddjjClass = (ddjj: string) => {
    if (ddjj === 'Al día') return 'badge-ok';
    if (ddjj === 'Pendiente') return 'badge-warn';
    return 'badge-danger';
  };

  const rubroClass = (rubro: Rubro) => {
    if (rubro === 'profesional') return 'badge-rubro-prof';
    if (rubro === 'industrial') return 'badge-rubro-ind';
    if (rubro === 'alquiler') return 'badge-rubro-alq';
    if (rubro === 'empresa') return 'badge-rubro-emp';
    if (rubro === 'unipersonal') return 'badge-rubro-uni';
    return 'badge-rubro-otro';
  };

  const MONTH_NAMES = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre'
  ];

  async function loadImportBatches(yearStr = '') {
    const qs = yearStr ? `?year=${yearStr}` : '';
    const res = await fetch(`/api/clients/import${qs}`);
    if (res.ok) {
      const data = await res.json();
      setImportBatches(data.batches || []);
    }
  }

  function openImportDialog() {
    setImportTab('new');
    setImportFileName('');
    setImportParsedRows([]);
    setImportPreview([]);
    setImportCounts({ new: 0, duplicate_db: 0, duplicate_file: 0, invalid: 0 });
    setImportDuplicateAction('skip');
    setImportYear(new Date().getFullYear());
    setImportMonth(new Date().getMonth() + 1);
    setImportRecordHistory(true);
    setImportBatchYearFilter('');
    setImportError('');
    loadImportBatches();
    importDialogRef.current?.showModal();
  }

  async function runImportDryRun(rowsToCheck: Array<Record<string, unknown>>) {
    if (rowsToCheck.length === 0) {
      setImportPreview([]);
      setImportCounts({ new: 0, duplicate_db: 0, duplicate_file: 0, invalid: 0 });
      return;
    }
    const res = await fetch('/api/clients/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: rowsToCheck, dryRun: true })
    });
    const data = await res.json();
    if (!res.ok) {
      setImportError(data.error || 'Error al analizar el archivo.');
      return;
    }
    setImportPreview(data.preview || []);
    setImportCounts(data.counts || { new: 0, duplicate_db: 0, duplicate_file: 0, invalid: 0 });
  }

  async function handleExcelFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportFileName(file.name);
    setImportLoading(true);
    try {
      const { rows: parsed, detectedYear, detectedMonth } = await parseExcelClientsFile(file);
      if (parsed.length === 0) {
        setImportError('No se encontraron filas de clientes en el archivo.');
        setImportParsedRows([]);
        setImportPreview([]);
        return;
      }
      if (detectedYear) setImportYear(detectedYear);
      if (detectedMonth) setImportMonth(detectedMonth);
      setImportParsedRows(parsed);
      await runImportDryRun(parsed);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'No se pudo leer el archivo Excel.');
    } finally {
      setImportLoading(false);
    }
  }

  function handleEditImportField(
    rowNumber: number,
    field: string,
    value: string | number
  ) {
    setImportParsedRows((prev) =>
      prev.map((row) =>
        Number(row._rowNumber) === rowNumber ? { ...row, [field]: value } : row
      )
    );
    setImportPreview((prev) =>
      prev.map((item) =>
        item.rowNumber === rowNumber
          ? { ...item, data: { ...item.data, [field]: value } }
          : item
      )
    );
  }

  async function handleRemoveImportRow(rowNumber: number) {
    const nextRows = importParsedRows.filter(
      (row) => Number(row._rowNumber) !== rowNumber
    );
    setImportParsedRows(nextRows);
    await runImportDryRun(nextRows);
  }

  async function handleRevalidateImport() {
    setImportLoading(true);
    setImportError('');
    try {
      await runImportDryRun(importParsedRows);
      showToast('Validación de filas actualizada.');
    } finally {
      setImportLoading(false);
    }
  }

  async function handleConfirmImport() {
    if (importParsedRows.length === 0) return;
    setImportLoading(true);
    setImportError('');
    const monthStr = String(importMonth).padStart(2, '0');
    const periodCode = `${importYear}-${monthStr}`;
    const periodFecha = `${importYear}-${monthStr}-01`;
    const monthLabel = MONTH_NAMES[importMonth - 1] || '';

    try {
      const res = await fetch('/api/clients/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: importParsedRows,
          dryRun: false,
          duplicateAction: importDuplicateAction,
          period: {
            year: importYear,
            monthLabel,
            periodo: periodCode,
            fecha: periodFecha,
            fileName: importFileName,
            recordHistory: importRecordHistory
          }
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || 'Error al importar clientes.');
        return;
      }
      importDialogRef.current?.close();
      showToast(
        `Importación (${monthLabel} ${importYear}): ${data.inserted} nuevos${
          data.updated ? `, ${data.updated} actualizados` : ''
        }.`
      );
      await fetchClients();
    } catch {
      setImportError('Error de conexión al importar.');
    } finally {
      setImportLoading(false);
    }
  }

  const historyEstadoClass = (estado: string) => {
    if (estado === 'Pagado') return 'badge-ok';
    if (estado === 'Pendiente') return 'badge-warn';
    return 'badge-danger';
  };

  const advancedFilterCount = [
    filterMesCierre,
    filterDdjj,
    filterEeff,
    filterDictamen,
    fechaDesde,
    fechaHasta
  ].filter(Boolean).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img
              src="/assets/logo-rengifo.png"
              alt="Logo Rengifo Ltda"
              className="brand-logo"
              width={38}
              height={38}
            />
            <div className="brand-text">
              <span className="brand-name">Rengifo Ltda</span>
              <span className="brand-tag">Sistemas de gestión de clientes</span>
            </div>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="btn btn-topbar-ghost"
              onClick={() => setShowCharts((v) => !v)}
              aria-pressed={showCharts}
            >
              <BarChart3 size={16} aria-hidden="true" />
              {showCharts ? 'Ocultar gráficos' : 'Ver gráficos'}
            </button>
            <button type="button" className="btn btn-primary" onClick={openCreateForm}>
              <Plus size={17} aria-hidden="true" />
              Nuevo cliente
            </button>
            <div className="user-pill">
              <span className="user-name">{user.full_name || user.username}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleLogout}
                title="Cerrar sesión"
              >
                <LogOut size={15} aria-hidden="true" />
                Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* KPIs rápidos */}
        <section className="kpi-strip" aria-label="Resumen de clientes">
          <button
            type="button"
            className={`kpi-card ${!filterEstado && !quickDdjjPending ? 'is-active' : ''}`}
            onClick={() => {
              setQuickDdjjPending(false);
              setFilterEstado('');
            }}
          >
            <span className="kpi-label">Total clientes</span>
            <strong className="kpi-value">{stats.total}</strong>
          </button>

          <button
            type="button"
            className={`kpi-card ${filterEstado === 'Activo' && !quickDdjjPending ? 'is-active' : ''}`}
            onClick={() => {
              setQuickDdjjPending(false);
              setFilterEstado('Activo');
            }}
          >
            <span className="kpi-label">Activos</span>
            <strong className="kpi-value kpi-ok">{stats.activos}</strong>
          </button>

          <button
            type="button"
            className={`kpi-card ${filterEstado === 'Inactivo / Suspendido' ? 'is-active' : ''}`}
            onClick={() => {
              setQuickDdjjPending(false);
              setFilterEstado('Inactivo / Suspendido');
            }}
          >
            <span className="kpi-label">Suspendidos</span>
            <strong className="kpi-value kpi-warn">{stats.inactivos}</strong>
          </button>

          <button
            type="button"
            className={`kpi-card ${filterEstado === 'Baja' ? 'is-active' : ''}`}
            onClick={() => {
              setQuickDdjjPending(false);
              setFilterEstado('Baja');
            }}
          >
            <span className="kpi-label">De baja</span>
            <strong className="kpi-value kpi-danger">{stats.bajas}</strong>
          </button>

          <button
            type="button"
            className={`kpi-card ${quickDdjjPending ? 'is-active' : ''}`}
            onClick={() => {
              setQuickDdjjPending(true);
              setFilterEstado('Activo');
            }}
          >
            <span className="kpi-label">DD.JJ. pendientes</span>
            <strong className="kpi-value kpi-accent">{stats.ddjj_pendientes}</strong>
          </button>
        </section>

        {/* Resumen Financiero */}
        <section className="finance-strip" aria-label="Totales financieros y fiscales">
          <div className="finance-item">
            <span className="finance-label">Honorarios Activos / Mes</span>
            <strong className="finance-value finance-value-orange">
              {formatBs(financialSummary.totalHonorariosActivos)}
            </strong>
          </div>
          <div className="finance-item">
            <span className="finance-label">Proyección Anual</span>
            <strong className="finance-value">
              {formatBs(financialSummary.proyeccionAnualHonorarios)}
            </strong>
          </div>
          <div className="finance-item">
            <span className="finance-label">Saldo IVA Acumulado</span>
            <strong className="finance-value">{formatBs(financialSummary.totalSaldoIva)}</strong>
          </div>
          <div className="finance-item">
            <span className="finance-label">Saldo IT Acumulado</span>
            <strong className="finance-value">{formatBs(financialSummary.totalSaldoIt)}</strong>
          </div>
        </section>

        {/* Dashboard Visual (Gráficos) */}
        {showCharts && (
          <DashboardCharts clients={sortedClients} summary={financialSummary} />
        )}

        {/* Búsqueda y filtros */}
        <section className="filter-panel" aria-label="Búsqueda y filtros">
          <search>
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="search-row">
                <div className="search-input-wrap">
                  <Search size={17} className="search-icon" aria-hidden="true" />
                  <label htmlFor="search-q" className="visually-hidden">
                    Buscar cliente
                  </label>
                  <input
                    ref={searchInputRef}
                    type="search"
                    id="search-q"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="search"
                    placeholder="Buscar por razón social, NIT, correo o celular..."
                  />
                  <kbd className="shortcut-badge" aria-hidden="true">
                    Ctrl K
                  </kbd>
                </div>

                <div className="search-actions">
                  <button
                    type="button"
                    className={`btn btn-secondary ${showAdvancedFilters || advancedFilterCount > 0 ? 'is-filter-open' : ''}`}
                    onClick={() => setShowAdvancedFilters((v) => !v)}
                    aria-expanded={showAdvancedFilters}
                  >
                    <Filter size={15} aria-hidden="true" />
                    Filtros
                    {advancedFilterCount > 0 && (
                      <span className="filter-count-pill">{advancedFilterCount}</span>
                    )}
                  </button>
                  {hasActiveFilters && (
                    <button type="button" className="btn btn-ghost" onClick={clearFilters}>
                      <X size={15} aria-hidden="true" />
                      Limpiar
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary" onClick={openImportDialog}>
                    <Upload size={16} aria-hidden="true" />
                    Importar
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={handleExportExcel}>
                    <FileSpreadsheet size={16} aria-hidden="true" />
                    Excel
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={handleExportPdf}>
                    <FileText size={16} aria-hidden="true" />
                    PDF
                  </button>
                </div>
              </div>

              {/* Chips visuales rápidos: Estado y Rubro */}
              <div className="quick-chips-row">
                <div className="chip-group" role="group" aria-label="Filtrar por estado">
                  <span className="chip-group-label">Estado:</span>
                  {(
                    [
                      ['', 'Todos'],
                      ['Activo', 'Activo'],
                      ['Inactivo / Suspendido', 'Suspendido'],
                      ['Baja', 'Baja']
                    ] as const
                  ).map(([val, lbl]) => (
                    <button
                      key={val || 'all'}
                      type="button"
                      className={`filter-chip ${filterEstado === val && !quickDdjjPending ? 'is-active' : ''}`}
                      onClick={() => {
                        setQuickDdjjPending(false);
                        setFilterEstado(val);
                      }}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                <div className="chip-group" role="group" aria-label="Filtrar por categoría">
                  <span className="chip-group-label">Categoría:</span>
                  <button
                    type="button"
                    className={`filter-chip ${filterRubro === '' ? 'is-active' : ''}`}
                    onClick={() => setFilterRubro('')}
                  >
                    Todos
                  </button>
                  {RUBRO_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`filter-chip ${filterRubro === opt.value ? 'is-active' : ''}`}
                      onClick={() => setFilterRubro(opt.value)}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtros avanzados y de tiempo */}
              {showAdvancedFilters && (
                <div className="advanced-filters-box">
                  <div className="filters-grid">
                    <div className="filter-item">
                      <label htmlFor="filter-mes-cierre">Mes de cierre</label>
                      <select
                        id="filter-mes-cierre"
                        value={filterMesCierre}
                        onChange={(e) => setFilterMesCierre(e.target.value)}
                      >
                        <option value="">Todos</option>
                        <option value="Marzo">Marzo</option>
                        <option value="Junio">Junio</option>
                        <option value="Septiembre">Septiembre</option>
                        <option value="Diciembre">Diciembre</option>
                      </select>
                    </div>

                    <div className="filter-item">
                      <label htmlFor="filter-ddjj">Declaraciones Juradas</label>
                      <select
                        id="filter-ddjj"
                        value={filterDdjj}
                        onChange={(e) => {
                          setQuickDdjjPending(false);
                          setFilterDdjj(e.target.value);
                        }}
                      >
                        <option value="">Todas</option>
                        <option value="Al día">Al día</option>
                        <option value="Pendiente">Pendiente</option>
                        <option value="Observado">Observado</option>
                      </select>
                    </div>

                    <div className="filter-item">
                      <label htmlFor="filter-eeff">Estados Financieros</label>
                      <select
                        id="filter-eeff"
                        value={filterEeff}
                        onChange={(e) => setFilterEeff(e.target.value)}
                      >
                        <option value="">Todos</option>
                        <option value="Presentado">Presentado</option>
                        <option value="En proceso">En proceso</option>
                        <option value="Pendiente">Pendiente</option>
                        <option value="No aplica">No aplica</option>
                      </select>
                    </div>

                    <div className="filter-item">
                      <label htmlFor="filter-dictamen">Dictamen</label>
                      <select
                        id="filter-dictamen"
                        value={filterDictamen}
                        onChange={(e) => setFilterDictamen(e.target.value)}
                      >
                        <option value="">Todos</option>
                        <option value="Con dictamen">Con dictamen</option>
                        <option value="Sin dictamen">Sin dictamen</option>
                        <option value="No aplica">No aplica</option>
                      </select>
                    </div>
                  </div>

                  {/* Filtros de tiempo / histórico */}
                  <div className="time-filter-bar">
                    <div className="time-presets" role="group" aria-label="Rango rápido de tiempo">
                      <span className="time-label">
                        <Clock size={14} aria-hidden="true" /> Período:
                      </span>
                      {(
                        [
                          ['all', 'Todo'],
                          ['month', 'Este mes'],
                          ['quarter', 'Últimos 3 meses'],
                          ['year', 'Este año']
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className={`time-pill ${timePreset === key ? 'is-active' : ''}`}
                          onClick={() => applyTimePreset(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="time-range-inputs">
                      <label className="visually-hidden" htmlFor="filter-campo-fecha">
                        Filtrar fecha por
                      </label>
                      <select
                        id="filter-campo-fecha"
                        value={campoFecha}
                        onChange={(e) => setCampoFecha(e.target.value)}
                      >
                        <option value="historico">Histórico pagos/forms.</option>
                        <option value="fecha_ingreso">Fecha de ingreso</option>
                        <option value="fecha_inactivacion">Fecha inactivación</option>
                        <option value="fecha_baja">Fecha de baja</option>
                      </select>

                      <input
                        type="date"
                        aria-label="Desde fecha"
                        value={fechaDesde}
                        onChange={(e) => {
                          setTimePreset('all');
                          setFechaDesde(e.target.value);
                        }}
                      />
                      <span className="time-sep">—</span>
                      <input
                        type="date"
                        aria-label="Hasta fecha"
                        value={fechaHasta}
                        onChange={(e) => {
                          setTimePreset('all');
                          setFechaHasta(e.target.value);
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </form>
          </search>

          <div className="results-bar">
            <span className="results-count">
              {loading
                ? 'Cargando...'
                : `${sortedClients.length} ${sortedClients.length === 1 ? 'cliente' : 'clientes'}`}
            </span>
          </div>
        </section>

        {/* Tabla de vista previa rápida (datos clave) */}
        <section className="table-card">
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="clients-table-caption"
            className="table-wrapper"
          >
            <table id="clients-table">
              <caption id="clients-table-caption" className="visually-hidden">
                Directorio centralizado de clientes
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    aria-sort={sortKey === 'razon_social' ? sortDir : undefined}
                  >
                    <button type="button" className="sort-btn" onClick={() => toggleSort('razon_social')}>
                      Razón Social / Nombre <span className="sort-icon" aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col" aria-sort={sortKey === 'nit' ? sortDir : undefined}>
                    <button type="button" className="sort-btn" onClick={() => toggleSort('nit')}>
                      NIT <span className="sort-icon" aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col" aria-sort={sortKey === 'correo' ? sortDir : undefined}>
                    <button type="button" className="sort-btn" onClick={() => toggleSort('correo')}>
                      Correo electrónico <span className="sort-icon" aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col">Clave correo</th>
                  <th scope="col">Clave SIAT</th>
                  <th scope="col" aria-sort={sortKey === 'rubro' ? sortDir : undefined}>
                    <button type="button" className="sort-btn" onClick={() => toggleSort('rubro')}>
                      Categoría <span className="sort-icon" aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col" aria-sort={sortKey === 'fecha_ingreso' ? sortDir : undefined}>
                    <button type="button" className="sort-btn" onClick={() => toggleSort('fecha_ingreso')}>
                      Ingreso <span className="sort-icon" aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col" aria-sort={sortKey === 'estado' ? sortDir : undefined}>
                    <button type="button" className="sort-btn" onClick={() => toggleSort('estado')}>
                      Estado <span className="sort-icon" aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col" className="actions-col">
                    Ficha
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedClients.map((c) => {
                  const correoKey = `${c.id}-correo`;
                  const siatKey = `${c.id}-siat`;
                  const showCorreo = Boolean(revealedSecrets[correoKey]);
                  const showSiat = Boolean(revealedSecrets[siatKey]);

                  return (
                    <tr key={c.id} onClick={() => openDetail(c)}>
                      <th scope="row">
                        <div className="client-name-cell">
                          <span className="client-name-main">{c.razon_social}</span>
                        </div>
                      </th>
                      <td>
                        <span className="mono-copy">
                          <span>{c.nit}</span>
                          <CopyButton value={c.nit} label="NIT" onCopy={copyText} />
                        </span>
                      </td>
                      <td>
                        <span className="mono-copy">
                          <span className="truncate-email">{c.correo || '—'}</span>
                          <CopyButton value={c.correo} label="Correo" onCopy={copyText} />
                        </span>
                      </td>
                      <td>
                        {c.contrasena_correo ? (
                          <span className="secret-box">
                            <span className="mono-copy">
                              {showCorreo ? c.contrasena_correo : '••••••'}
                            </span>
                            <button
                              type="button"
                              className="btn-copy-inline"
                              title={showCorreo ? 'Ocultar clave' : 'Ver clave'}
                              aria-label={showCorreo ? 'Ocultar clave correo' : 'Ver clave correo'}
                              onClick={(e) => {
                                e.stopPropagation();
                                setRevealedSecrets((prev) => ({
                                  ...prev,
                                  [correoKey]: !prev[correoKey]
                                }));
                              }}
                            >
                              {showCorreo ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            <CopyButton
                              value={c.contrasena_correo}
                              label="Clave correo"
                              onCopy={copyText}
                            />
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {c.contrasena_siat ? (
                          <span className="secret-box">
                            <span className="mono-copy">
                              {showSiat ? c.contrasena_siat : '••••••'}
                            </span>
                            <button
                              type="button"
                              className="btn-copy-inline"
                              title={showSiat ? 'Ocultar clave SIAT' : 'Ver clave SIAT'}
                              aria-label={showSiat ? 'Ocultar clave SIAT' : 'Ver clave SIAT'}
                              onClick={(e) => {
                                e.stopPropagation();
                                setRevealedSecrets((prev) => ({
                                  ...prev,
                                  [siatKey]: !prev[siatKey]
                                }));
                              }}
                            >
                              {showSiat ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            <CopyButton
                              value={c.contrasena_siat}
                              label="Clave SIAT"
                              onCopy={copyText}
                            />
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span className={`badge ${rubroClass(c.rubro)}`}>
                          {RUBRO_LABELS[c.rubro] || c.rubro}
                        </span>
                      </td>
                      <td className="mono-copy">{c.fecha_ingreso || '—'}</td>
                      <td>
                        <div className="estado-stack">
                          <span className={`badge ${estadoClass(c.estado)}`}>{c.estado}</span>
                          {c.declaraciones_juradas !== 'Al día' && (
                            <span className={`badge ${ddjjClass(c.declaraciones_juradas)}`}>
                              DD.JJ: {c.declaraciones_juradas}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="actions-col">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(c);
                          }}
                        >
                          Ver ficha
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!loading && sortedClients.length === 0 && (
            <div className="empty-state">
              <p>No se encontraron clientes con los filtros actuales.</p>
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                Mostrar todos
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Modal: Ficha Completa del Cliente */}
      <dialog
        ref={detailDialogRef}
        className="dialog-panel"
        {...({ closedby: 'any' } as Record<string, string>)}
        aria-labelledby="detail-title"
        onClose={(e) => {
          e.currentTarget.returnValue = '';
        }}
      >
        {selectedClient && (
          <>
            <div className="dialog-header detail-hero-header">
              <div>
                <div className="detail-badges">
                  <span className={`badge ${estadoClass(selectedClient.estado)}`}>
                    {selectedClient.estado}
                  </span>
                  <span className={`badge ${rubroClass(selectedClient.rubro)}`}>
                    {RUBRO_LABELS[selectedClient.rubro] || selectedClient.rubro}
                  </span>
                </div>
                <h2 id="detail-title">{selectedClient.razon_social}</h2>
                <div className="detail-nit-row">
                  <span className="mono-copy">NIT: {selectedClient.nit}</span>
                  <CopyButton value={selectedClient.nit} label="NIT" onCopy={copyText} />
                </div>
              </div>
              <div className="dialog-header-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => exportSingleClientPdf(selectedClient)}
                >
                  <FileText size={14} aria-hidden="true" />
                  PDF
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => openEditForm(selectedClient)}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Editar
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => detailDialogRef.current?.close()}
                  aria-label="Cerrar ficha"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="detail-tabs" role="tablist" aria-label="Secciones de la ficha">
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'general'}
                className={`detail-tab ${detailTab === 'general' ? 'is-active' : ''}`}
                onClick={() => setDetailTab('general')}
              >
                <Building2 size={14} aria-hidden="true" />
                Información General
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'history'}
                className={`detail-tab ${detailTab === 'history' ? 'is-active' : ''}`}
                onClick={() => setDetailTab('history')}
              >
                <History size={14} aria-hidden="true" />
                Histórico de Pagos y Formularios ({historyRecords.length})
              </button>
            </div>

            {detailTab === 'general' ? (
              <div className="dialog-body">
                {/* Resumen visual rápido dentro de la ficha */}
                <div className="detail-metrics-strip">
                  <div className="detail-metric-pill">
                    <span>Honorarios</span>
                    <strong>{formatBs(selectedClient.honorarios_profesionales)}</strong>
                  </div>
                  <div className="detail-metric-pill">
                    <span>Saldo IVA</span>
                    <strong>{formatBs(selectedClient.saldo_iva)}</strong>
                  </div>
                  <div className="detail-metric-pill">
                    <span>Saldo IT</span>
                    <strong>{formatBs(selectedClient.saldo_it)}</strong>
                  </div>
                  <div className="detail-metric-pill">
                    <span>Cierre fiscal</span>
                    <strong>{selectedClient.mes_cierre || '—'}</strong>
                  </div>
                </div>

                <div className="detail-grid">
              <section className="detail-card">
                <h3><Building2 size={14} aria-hidden="true" /> Datos Generales</h3>
                <dl className="detail-list">
                  <div className="detail-row">
                    <dt>Rubro específico</dt>
                    <dd>{selectedClient.rubro_especifico || '—'}</dd>
                  </div>
                  {selectedClient.ci_numero && (
                    <div className="detail-row">
                      <dt>Carnet de Identidad</dt>
                      <dd className="mono-copy">
                        <span>
                          {selectedClient.ci_numero}{' '}
                          {selectedClient.ci_extension}
                        </span>
                        <CopyButton
                          value={`${selectedClient.ci_numero} ${selectedClient.ci_extension}`.trim()}
                          label="Carnet"
                          onCopy={copyText}
                        />
                      </dd>
                    </div>
                  )}
                  <div className="detail-row">
                    <dt>Celular</dt>
                    <dd className="mono-copy">
                      <span>{selectedClient.celular || '—'}</span>
                      <CopyButton value={selectedClient.celular} label="Celular" onCopy={copyText} />
                    </dd>
                  </div>
                  <div className="detail-row">
                    <dt>Dirección</dt>
                    <dd className="mono-copy">
                      <span>{selectedClient.direccion || '—'}</span>
                      <CopyButton value={selectedClient.direccion} label="Dirección" onCopy={copyText} />
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="detail-card">
                <h3><KeyRound size={14} aria-hidden="true" /> Credenciales</h3>
                <dl className="detail-list">
                  <div className="detail-row">
                    <dt>Correo</dt>
                    <dd className="mono-copy">
                      <span>{selectedClient.correo || '—'}</span>
                      <CopyButton value={selectedClient.correo} label="Correo" onCopy={copyText} />
                    </dd>
                  </div>
                  <div className="detail-row">
                    <dt>Contraseña</dt>
                    <dd className="secret-box">
                      <span className="mono-copy">
                        {selectedClient.contrasena_correo
                          ? showPassCorreo
                            ? selectedClient.contrasena_correo
                            : '••••••••'
                          : '—'}
                      </span>
                      {selectedClient.contrasena_correo && (
                        <>
                          <button
                            type="button"
                            className="btn-copy-inline"
                            onClick={() => setShowPassCorreo((v) => !v)}
                            aria-label={showPassCorreo ? 'Ocultar' : 'Ver'}
                          >
                            {showPassCorreo ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <CopyButton
                            value={selectedClient.contrasena_correo}
                            label="Contraseña"
                            onCopy={copyText}
                          />
                        </>
                      )}
                    </dd>
                  </div>
                  <div className="detail-row">
                    <dt>Clave SIAT</dt>
                    <dd className="secret-box">
                      <span className="mono-copy">
                        {selectedClient.contrasena_siat
                          ? showPassSiat
                            ? selectedClient.contrasena_siat
                            : '••••••••'
                          : '—'}
                      </span>
                      {selectedClient.contrasena_siat && (
                        <>
                          <button
                            type="button"
                            className="btn-copy-inline"
                            onClick={() => setShowPassSiat((v) => !v)}
                            aria-label={showPassSiat ? 'Ocultar' : 'Ver'}
                          >
                            {showPassSiat ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <CopyButton
                            value={selectedClient.contrasena_siat}
                            label="Clave SIAT"
                            onCopy={copyText}
                          />
                        </>
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="detail-card">
                <h3><Calendar size={14} aria-hidden="true" /> Fechas y Ciclo</h3>
                <dl className="detail-list">
                  <div className="detail-row">
                    <dt>Ingreso</dt>
                    <dd>{selectedClient.fecha_ingreso || '—'}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Inactivación / Susp.</dt>
                    <dd>{selectedClient.fecha_inactivacion || '—'}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Baja</dt>
                    <dd>{selectedClient.fecha_baja || '—'}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Fecha de pago</dt>
                    <dd>{selectedClient.fecha_pago || '—'}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Mes de cierre</dt>
                    <dd>{selectedClient.mes_cierre || '—'}</dd>
                  </div>
                </dl>
              </section>

              <section className="detail-card">
                <h3><Wallet size={14} aria-hidden="true" /> Tributario y Saldos</h3>
                <dl className="detail-list">
                  <div className="detail-row">
                    <dt>Honorarios</dt>
                    <dd>{formatBs(selectedClient.honorarios_profesionales)}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Declaraciones juradas</dt>
                    <dd>{selectedClient.declaraciones_juradas}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Estados financieros</dt>
                    <dd>{selectedClient.estados_financieros}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Dictamen</dt>
                    <dd>{selectedClient.dictamen}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Saldo IVA</dt>
                    <dd>{formatBs(selectedClient.saldo_iva)}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Saldo IT</dt>
                    <dd>{formatBs(selectedClient.saldo_it)}</dd>
                  </div>
                </dl>
              </section>

              {selectedClient.notas && (
                <section className="detail-card" style={{ gridColumn: '1 / -1' }}>
                  <h3>Notas</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>{selectedClient.notas}</p>
                </section>
              )}
                </div>
              </div>
            ) : (
              <div className="dialog-body history-pane">
                <div className="history-toolbar">
                  <div className="history-date-filters">
                    <input
                      type="date"
                      aria-label="Histórico desde"
                      value={historyFrom}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHistoryFrom(val);
                        loadClientHistory(selectedClient.id, val, historyTo);
                      }}
                    />
                    <span className="time-sep">—</span>
                    <input
                      type="date"
                      aria-label="Histórico hasta"
                      value={historyTo}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHistoryTo(val);
                        loadClientHistory(selectedClient.id, historyFrom, val);
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowHistoryForm((v) => !v)}
                  >
                    <Plus size={14} aria-hidden="true" />
                    {showHistoryForm ? 'Cancelar' : 'Registrar pago / formulario'}
                  </button>
                </div>

                {showHistoryForm && (
                  <form className="history-add-form" onSubmit={handleAddHistoryRecord}>
                    <div className="form-grid-3">
                      <div className="field">
                        <label htmlFor="hr-fecha">Fecha</label>
                        <input
                          type="date"
                          id="hr-fecha"
                          required
                          value={newRecord.fecha_registro}
                          onChange={(e) =>
                            setNewRecord({ ...newRecord, fecha_registro: e.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="hr-tipo">Tipo</label>
                        <select
                          id="hr-tipo"
                          value={newRecord.tipo_evento}
                          onChange={(e) =>
                            setNewRecord({ ...newRecord, tipo_evento: e.target.value })
                          }
                        >
                          <option value="Declaración Jurada">Declaración Jurada</option>
                          <option value="Pago Honorarios">Pago Honorarios</option>
                          <option value="Estados Financieros">Estados Financieros</option>
                          <option value="Dictamen">Dictamen</option>
                          <option value="Actualización Saldos">Actualización Saldos</option>
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="hr-estado">Estado</label>
                        <select
                          id="hr-estado"
                          value={newRecord.estado_pago}
                          onChange={(e) =>
                            setNewRecord({
                              ...newRecord,
                              estado_pago: e.target.value as 'Pagado' | 'Pendiente' | 'Observado'
                            })
                          }
                        >
                          <option value="Pagado">Pagado</option>
                          <option value="Pendiente">Pendiente</option>
                          <option value="Observado">Observado</option>
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="hr-monto">Honorarios (Bs.)</label>
                        <input
                          type="number"
                          id="hr-monto"
                          step="0.01"
                          min="0"
                          value={newRecord.monto_honorarios}
                          onChange={(e) =>
                            setNewRecord({
                              ...newRecord,
                              monto_honorarios: Number(e.target.value)
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="hr-iva">Saldo IVA (Bs.)</label>
                        <input
                          type="number"
                          id="hr-iva"
                          step="0.01"
                          value={newRecord.saldo_iva}
                          onChange={(e) =>
                            setNewRecord({ ...newRecord, saldo_iva: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="hr-it">Saldo IT (Bs.)</label>
                        <input
                          type="number"
                          id="hr-it"
                          step="0.01"
                          value={newRecord.saldo_it}
                          onChange={(e) =>
                            setNewRecord({ ...newRecord, saldo_it: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="field span-3">
                        <label htmlFor="hr-forms">Formularios / Comprobante</label>
                        <input
                          type="text"
                          id="hr-forms"
                          placeholder="Ej. Form. 200, Form. 400, Recibo #104"
                          value={newRecord.formularios}
                          onChange={(e) =>
                            setNewRecord({ ...newRecord, formularios: e.target.value })
                          }
                        />
                      </div>
                      <div className="field span-3">
                        <label htmlFor="hr-obs">Observaciones</label>
                        <input
                          type="text"
                          id="hr-obs"
                          placeholder="Detalle breve del pago o presentación"
                          value={newRecord.observaciones}
                          onChange={(e) =>
                            setNewRecord({ ...newRecord, observaciones: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="submit" className="btn btn-primary btn-sm">
                        Guardar en histórico
                      </button>
                    </div>
                  </form>
                )}

                {historyLoading ? (
                  <p className="history-empty">Cargando histórico...</p>
                ) : historyRecords.length === 0 ? (
                  <p className="history-empty">
                    No hay registros históricos en el período seleccionado.
                  </p>
                ) : (
                  <ul className="history-list">
                    {historyRecords.map((rec) => (
                      <li key={rec.id} className="history-item">
                        <div className="history-item-head">
                          <div className="history-item-title">
                            <span className="history-date">{rec.fecha_registro}</span>
                            <strong>{rec.tipo_evento}</strong>
                            <span className={`badge ${historyEstadoClass(rec.estado_pago)}`}>
                              {rec.estado_pago}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-danger-ghost btn-sm"
                            aria-label="Eliminar registro"
                            onClick={() => handleDeleteHistoryRecord(rec.id)}
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        </div>
                        {rec.formularios && (
                          <p className="history-forms">{rec.formularios}</p>
                        )}
                        <div className="history-metrics">
                          <span>Honorarios: <strong>{formatBs(rec.monto_honorarios)}</strong></span>
                          <span>IVA: <strong>{formatBs(rec.saldo_iva)}</strong></span>
                          <span>IT: <strong>{formatBs(rec.saldo_it)}</strong></span>
                        </div>
                        {rec.observaciones && (
                          <p className="history-obs">{rec.observaciones}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <footer className="dialog-footer dialog-footer-split">
              <button
                type="button"
                className="btn btn-danger-ghost btn-sm"
                onClick={() => handleDeleteClient(selectedClient)}
              >
                <Trash2 size={14} aria-hidden="true" />
                Eliminar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => detailDialogRef.current?.close()}
              >
                Cerrar
              </button>
            </footer>
          </>
        )}
      </dialog>

      {/* Modal: Crear / Editar Cliente (Visual e Intuitivo) */}
      <dialog
        ref={formDialogRef}
        className="dialog-panel dialog-xl"
        {...({ closedby: 'closerequest' } as Record<string, string>)}
        aria-labelledby="client-form-title"
        onClose={(e) => {
          e.currentTarget.returnValue = '';
        }}
      >
        <div className="dialog-header">
          <div>
            <h2 id="client-form-title">
              {editingId ? `Editar: ${formState.razon_social}` : 'Nuevo cliente'}
            </h2>
            <p className="dialog-subtitle">
              Solo Nombre/Razón Social y NIT son obligatorios; el resto es opcional.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => formDialogRef.current?.close()}
            aria-label="Cerrar formulario"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form className="dialog-body" onSubmit={handleSaveClient} noValidate>
          {formError && (
            <div className="form-alert" role="alert">
              {formError}
            </div>
          )}

          {/* Bloque 1: Datos principales con selectores visuales */}
          <fieldset className="form-section">
            <legend>
              <Building2 size={14} aria-hidden="true" /> 1. Datos Principales
            </legend>
            <div className="form-grid-2">
              <div className="field span-2">
                <label htmlFor="cf-razon">
                  Nombre o Razón Social <span aria-hidden="true">*</span>
                </label>
                <input
                  type="text"
                  id="cf-razon"
                  required
                  placeholder="Ej. Constructora Andina S.R.L. o Juan Pérez"
                  value={formState.razon_social}
                  onChange={(e) => setFormState({ ...formState, razon_social: e.target.value })}
                />
              </div>

              <div className="field span-2">
                <label htmlFor="cf-nit">
                  NIT <span aria-hidden="true">*</span>
                </label>
                <input
                  type="text"
                  id="cf-nit"
                  inputMode="numeric"
                  required
                  placeholder="Ej. 1028475021"
                  value={formState.nit}
                  onChange={(e) => {
                    const newNit = e.target.value;
                    const autoPago = getFechaPagoFromNit(newNit);
                    const shouldAuto =
                      !formState.fecha_pago ||
                      /^Día \d{1,2} de cada mes$/.test(formState.fecha_pago);
                    setFormState({
                      ...formState,
                      nit: newNit,
                      fecha_pago: shouldAuto && autoPago ? autoPago : formState.fecha_pago
                    });
                  }}
                />
              </div>

              {/* Selector gráfico de Categoría */}
              <div className="field span-2">
                <span className="field-label">Categoría</span>
                <div className="visual-picker visual-picker-6" role="radiogroup" aria-label="Categoría">
                  {RUBRO_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={formState.rubro === opt.value}
                      className={`visual-pill ${formState.rubro === opt.value ? 'is-selected' : ''}`}
                      onClick={() => setFormState({ ...formState, rubro: opt.value })}
                    >
                      {opt.icon}
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {formState.rubro === 'unipersonal' && (
                <>
                  <div className="field">
                    <label htmlFor="cf-ci-num">
                      Carnet de Identidad <span aria-hidden="true">*</span>
                    </label>
                    <input
                      type="text"
                      id="cf-ci-num"
                      inputMode="numeric"
                      required
                      pattern="^[0-9]{4,12}(-[A-Za-z0-9]{1,3})?$"
                      placeholder="Ej. 6849106 o 6849106-1A"
                      value={formState.ci_numero}
                      onChange={(e) =>
                        setFormState({ ...formState, ci_numero: e.target.value.toUpperCase() })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="cf-ci-ext">
                      Extensión (Dpto. / País) <span aria-hidden="true">*</span>
                    </label>
                    <select
                      id="cf-ci-ext"
                      required
                      value={formState.ci_extension}
                      onChange={(e) =>
                        setFormState({ ...formState, ci_extension: e.target.value })
                      }
                    >
                      <option value="">Seleccionar...</option>
                      {CI_EXTENSIONS.map((ext) => (
                        <option key={ext.value} value={ext.value}>
                          {ext.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="field span-2">
                <label htmlFor="cf-rubro-esp">
                  Rubro específico <span className="opt-tag">Opcional</span>
                </label>
                <input
                  type="text"
                  id="cf-rubro-esp"
                  placeholder="Ej. Transporte, Salud, Construcción, Comercio..."
                  value={formState.rubro_especifico}
                  onChange={(e) =>
                    setFormState({ ...formState, rubro_especifico: e.target.value })
                  }
                />
              </div>

              {/* Selector gráfico de Estado */}
              <div className="field span-2">
                <span className="field-label">Estado actual</span>
                <div className="visual-picker visual-picker-3" role="radiogroup" aria-label="Estado">
                  {ESTADO_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={formState.estado === opt.value}
                      className={`visual-pill ${formState.estado === opt.value ? 'is-selected' : ''}`}
                      onClick={() => setFormState({ ...formState, estado: opt.value })}
                    >
                      {opt.icon}
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </fieldset>

          {/* Bloque 2: Contacto y Credenciales */}
          <fieldset className="form-section">
            <legend>
              <KeyRound size={14} aria-hidden="true" /> 2. Contacto y Accesos{' '}
              <span className="opt-tag">Opcional</span>
            </legend>
            <div className="form-grid-2">
              <div className="field">
                <label htmlFor="cf-celular">Celular</label>
                <input
                  type="tel"
                  id="cf-celular"
                  inputMode="tel"
                  placeholder="Ej. 71548920"
                  value={formState.celular}
                  onChange={(e) => setFormState({ ...formState, celular: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="cf-direccion">Dirección</label>
                <input
                  type="text"
                  id="cf-direccion"
                  placeholder="Dirección comercial o fiscal"
                  value={formState.direccion}
                  onChange={(e) => setFormState({ ...formState, direccion: e.target.value })}
                />
              </div>
            </div>
            <div className="form-grid-3">
              <div className="field">
                <label htmlFor="cf-correo">Correo electrónico</label>
                <input
                  type="email"
                  id="cf-correo"
                  spellCheck={false}
                  placeholder="correo@cliente.bo"
                  value={formState.correo}
                  onChange={(e) => setFormState({ ...formState, correo: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="cf-pass-correo">Contraseña</label>
                <input
                  type="text"
                  id="cf-pass-correo"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Clave correo"
                  value={formState.contrasena_correo}
                  onChange={(e) =>
                    setFormState({ ...formState, contrasena_correo: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="cf-pass-siat">Contraseña SIAT</label>
                <input
                  type="text"
                  id="cf-pass-siat"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Clave SIAT"
                  value={formState.contrasena_siat}
                  onChange={(e) =>
                    setFormState({ ...formState, contrasena_siat: e.target.value })
                  }
                />
              </div>
            </div>
          </fieldset>

          {/* Bloque 3: Ciclo y Fechas */}
          <fieldset className="form-section">
            <legend>
              <Calendar size={14} aria-hidden="true" /> 3. Fechas y Cierre{' '}
              <span className="opt-tag">Opcional</span>
            </legend>
            <div className="form-grid-2">
              <div className="field span-2">
                <span className="field-label">Mes de cierre</span>
                <div className="visual-picker" role="radiogroup" aria-label="Mes de cierre">
                  {CIERRE_OPTIONS.map((mes) => (
                    <button
                      key={mes}
                      type="button"
                      role="radio"
                      aria-checked={formState.mes_cierre === mes}
                      className={`visual-pill ${formState.mes_cierre === mes ? 'is-selected' : ''}`}
                      onClick={() => setFormState({ ...formState, mes_cierre: mes })}
                    >
                      <span>{mes}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="form-grid-3">
              <div className="field">
                <label htmlFor="cf-pago">Fecha de pago</label>
                <input
                  type="text"
                  id="cf-pago"
                  placeholder="Ej. Día 15 de cada mes"
                  value={formState.fecha_pago}
                  onChange={(e) => setFormState({ ...formState, fecha_pago: e.target.value })}
                />
                <span className="field-hint">
                  Se autocompleta según último dígito del NIT (DS 25619).
                </span>
              </div>
              <div className="field">
                <label htmlFor="cf-ingreso">Fecha de ingreso</label>
                <input
                  type="date"
                  id="cf-ingreso"
                  value={formState.fecha_ingreso}
                  onChange={(e) =>
                    setFormState({ ...formState, fecha_ingreso: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="cf-inactivacion">Fecha inactivación / susp.</label>
                <input
                  type="date"
                  id="cf-inactivacion"
                  value={formState.fecha_inactivacion}
                  onChange={(e) =>
                    setFormState({ ...formState, fecha_inactivacion: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="cf-baja">Fecha de baja</label>
                <input
                  type="date"
                  id="cf-baja"
                  value={formState.fecha_baja}
                  onChange={(e) => setFormState({ ...formState, fecha_baja: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="cf-honorarios">Honorarios (Bs.)</label>
                <input
                  type="number"
                  id="cf-honorarios"
                  step="0.01"
                  min="0"
                  value={formState.honorarios_profesionales}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      honorarios_profesionales: Number(e.target.value)
                    })
                  }
                />
              </div>
            </div>
          </fieldset>

          {/* Bloque 4: Tributario y Saldos */}
          <fieldset className="form-section">
            <legend>
              <Wallet size={14} aria-hidden="true" /> 4. Tributario y Saldos{' '}
              <span className="opt-tag">Opcional</span>
            </legend>
            <div className="form-grid-3">
              <div className="field">
                <label htmlFor="cf-ddjj">Declaraciones juradas</label>
                <select
                  id="cf-ddjj"
                  value={formState.declaraciones_juradas}
                  onChange={(e) =>
                    setFormState({ ...formState, declaraciones_juradas: e.target.value })
                  }
                >
                  <option value="Al día">Al día</option>
                  <option value="Pendiente">Pendiente</option>
                  <option value="Observado">Observado</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="cf-eeff">Estados financieros</label>
                <select
                  id="cf-eeff"
                  value={formState.estados_financieros}
                  onChange={(e) =>
                    setFormState({ ...formState, estados_financieros: e.target.value })
                  }
                >
                  <option value="Presentado">Presentado</option>
                  <option value="En proceso">En proceso</option>
                  <option value="Pendiente">Pendiente</option>
                  <option value="No aplica">No aplica</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="cf-dictamen">Dictamen</label>
                <select
                  id="cf-dictamen"
                  value={formState.dictamen}
                  onChange={(e) => setFormState({ ...formState, dictamen: e.target.value })}
                >
                  <option value="Con dictamen">Con dictamen</option>
                  <option value="Sin dictamen">Sin dictamen</option>
                  <option value="No aplica">No aplica</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="cf-iva">Saldo IVA (Bs.)</label>
                <input
                  type="number"
                  id="cf-iva"
                  step="0.01"
                  value={formState.saldo_iva}
                  onChange={(e) =>
                    setFormState({ ...formState, saldo_iva: Number(e.target.value) })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="cf-it">Saldo IT (Bs.)</label>
                <input
                  type="number"
                  id="cf-it"
                  step="0.01"
                  value={formState.saldo_it}
                  onChange={(e) =>
                    setFormState({ ...formState, saldo_it: Number(e.target.value) })
                  }
                />
              </div>
              <div className="field span-3">
                <label htmlFor="cf-notas">Notas</label>
                <textarea
                  id="cf-notas"
                  rows={2}
                  placeholder="Observaciones adicionales..."
                  value={formState.notas}
                  onChange={(e) => setFormState({ ...formState, notas: e.target.value })}
                />
              </div>
            </div>
          </fieldset>

          <footer className="dialog-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => formDialogRef.current?.close()}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cliente'}
            </button>
          </footer>
        </form>
      </dialog>

      {/* Modal: Importar Excel (.xls / .xlsx) con Previsualización y Discriminación de Duplicados */}
      <dialog
        ref={importDialogRef}
        className="dialog-panel dialog-xl"
        {...({ closedby: 'any' } as Record<string, string>)}
        aria-labelledby="import-dialog-title"
        onClose={(e) => {
          e.currentTarget.returnValue = '';
        }}
      >
        <div className="dialog-header">
          <div>
            <h2 id="import-dialog-title">Importar clientes desde Excel</h2>
            <p className="dialog-subtitle">
              Soporta archivos .xls, .xlsx y .csv. Valida los datos y discrimina NITs repetidos antes de guardar.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => importDialogRef.current?.close()}
            aria-label="Cerrar importador"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="detail-tabs" role="tablist" aria-label="Opciones de importación">
          <button
            type="button"
            role="tab"
            aria-selected={importTab === 'new'}
            className={`detail-tab ${importTab === 'new' ? 'is-active' : ''}`}
            onClick={() => setImportTab('new')}
          >
            <Upload size={14} aria-hidden="true" />
            Nueva importación
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={importTab === 'history'}
            className={`detail-tab ${importTab === 'history' ? 'is-active' : ''}`}
            onClick={() => {
              setImportTab('history');
              loadImportBatches(importBatchYearFilter);
            }}
          >
            <History size={14} aria-hidden="true" />
            Historial de importaciones ({importBatches.length})
          </button>
        </div>

        {importTab === 'new' ? (
          <div className="dialog-body">
            <div className="import-upload-box">
              <label htmlFor="excel-file-input" className="btn btn-secondary">
                <Upload size={16} aria-hidden="true" />
                {importFileName ? 'Cambiar archivo' : 'Seleccionar archivo (.xls / .xlsx)'}
              </label>
              <input
                id="excel-file-input"
                type="file"
                accept=".xls,.xlsx,.csv"
                className="visually-hidden"
                onChange={handleExcelFileSelected}
              />
              <span className="import-filename">
                {importFileName || 'Ningún archivo seleccionado'}
              </span>
            </div>

            {/* Apartado de tiempo / período de la importación */}
            <div className="import-period-bar">
              <div className="import-period-fields">
                <span className="time-label">
                  <Calendar size={14} aria-hidden="true" /> Período del archivo:
                </span>
                <select
                  aria-label="Mes de la importación"
                  value={importMonth}
                  onChange={(e) => setImportMonth(Number(e.target.value))}
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Año de la importación"
                  value={importYear}
                  onChange={(e) => setImportYear(Number(e.target.value))}
                >
                  {[2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <label className="import-history-check">
                <input
                  type="checkbox"
                  checked={importRecordHistory}
                  onChange={(e) => setImportRecordHistory(e.target.checked)}
                />
                Registrar en histórico de cada cliente
              </label>
            </div>

          {importError && (
            <div className="form-alert" role="alert">
              {importError}
            </div>
          )}

          {importPreview.length > 0 && (
            <>
              <div className="import-summary-bar">
                <div className="import-summary-pills">
                  <span className="badge badge-ok">
                    Nuevos: {importCounts.new}
                  </span>
                  <span className="badge badge-warn">
                    Repetidos en sistema: {importCounts.duplicate_db}
                  </span>
                  <span className="badge badge-neutral">
                    Repetidos en archivo: {importCounts.duplicate_file}
                  </span>
                  {importCounts.invalid > 0 && (
                    <span className="badge badge-danger">
                      Inválidos: {importCounts.invalid}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={importLoading}
                  onClick={handleRevalidateImport}
                >
                  Revalidar cambios
                </button>
              </div>

              {importCounts.duplicate_db > 0 && (
                <div className="import-dup-policy">
                  <span>Clientes repetidos ({importCounts.duplicate_db}):</span>
                  <label>
                    <input
                      type="radio"
                      name="dupPolicy"
                      checked={importDuplicateAction === 'skip'}
                      onChange={() => setImportDuplicateAction('skip')}
                    />
                    Omitir repetidos (recomendado)
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="dupPolicy"
                      checked={importDuplicateAction === 'update'}
                      onChange={() => setImportDuplicateAction('update')}
                    />
                    Actualizar datos de existentes
                  </label>
                </div>
              )}

              <div className="import-preview-scroll">
                <table className="import-preview-table">
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Estado</th>
                      <th>Razón Social / Nombre</th>
                      <th>NIT</th>
                      <th>Categoría</th>
                      <th>Correo</th>
                      <th>Clave SIAT</th>
                      <th>Clave Correo</th>
                      <th>Pago</th>
                      <th>Honorarios</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((item) => (
                      <tr key={item.rowNumber}>
                        <td>{item.rowNumber}</td>
                        <td>
                          <span
                            className={`badge ${
                              item.status === 'new'
                                ? 'badge-ok'
                                : item.status === 'duplicate_db'
                                ? 'badge-warn'
                                : item.status === 'duplicate_file'
                                ? 'badge-neutral'
                                : 'badge-danger'
                            }`}
                            title={item.reason}
                          >
                            {item.status === 'new'
                              ? 'Nuevo'
                              : item.status === 'duplicate_db'
                              ? 'Repetido'
                              : item.status === 'duplicate_file'
                              ? 'Dup. archivo'
                              : 'Inválido'}
                          </span>
                        </td>
                        <td>
                          <input
                            type="text"
                            className="import-cell-input import-cell-wide"
                            aria-label={`Razón Social fila ${item.rowNumber}`}
                            value={String(item.data.razon_social || '')}
                            onChange={(e) =>
                              handleEditImportField(item.rowNumber, 'razon_social', e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="import-cell-input import-cell-nit"
                            aria-label={`NIT fila ${item.rowNumber}`}
                            value={String(item.data.nit || '')}
                            onChange={(e) =>
                              handleEditImportField(item.rowNumber, 'nit', e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <select
                            className="import-cell-input"
                            aria-label={`Categoría fila ${item.rowNumber}`}
                            value={String(item.data.rubro || 'otro')}
                            onChange={(e) =>
                              handleEditImportField(item.rowNumber, 'rubro', e.target.value)
                            }
                          >
                            <option value="profesional">Profesional</option>
                            <option value="industrial">Industrial</option>
                            <option value="alquiler">Alquiler</option>
                            <option value="empresa">Empresa</option>
                            <option value="unipersonal">Unipersonal</option>
                            <option value="otro">Otro</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="email"
                            className="import-cell-input import-cell-wide"
                            aria-label={`Correo fila ${item.rowNumber}`}
                            value={String(item.data.correo || '')}
                            onChange={(e) =>
                              handleEditImportField(item.rowNumber, 'correo', e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="import-cell-input"
                            aria-label={`Clave SIAT fila ${item.rowNumber}`}
                            value={String(item.data.contrasena_siat || '')}
                            onChange={(e) =>
                              handleEditImportField(
                                item.rowNumber,
                                'contrasena_siat',
                                e.target.value
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="import-cell-input"
                            aria-label={`Clave Correo fila ${item.rowNumber}`}
                            value={String(item.data.contrasena_correo || '')}
                            onChange={(e) =>
                              handleEditImportField(
                                item.rowNumber,
                                'contrasena_correo',
                                e.target.value
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="import-cell-input"
                            aria-label={`Fecha de pago fila ${item.rowNumber}`}
                            value={String(item.data.fecha_pago || '')}
                            onChange={(e) =>
                              handleEditImportField(item.rowNumber, 'fecha_pago', e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="import-cell-input import-cell-num"
                            aria-label={`Honorarios fila ${item.rowNumber}`}
                            value={Number(item.data.honorarios_profesionales || 0)}
                            onChange={(e) =>
                              handleEditImportField(
                                item.rowNumber,
                                'honorarios_profesionales',
                                Number(e.target.value)
                              )
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-danger-ghost btn-sm"
                            title="Quitar fila de la importación"
                            aria-label={`Quitar fila ${item.rowNumber}`}
                            onClick={() => handleRemoveImportRow(item.rowNumber)}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        ) : (
          <div className="dialog-body">
            <div className="history-toolbar" style={{ marginBottom: '0.85rem' }}>
              <div className="import-period-fields">
                <span className="time-label">
                  <Calendar size={14} aria-hidden="true" /> Filtrar por año:
                </span>
                <select
                  aria-label="Filtrar historial de importaciones por año"
                  value={importBatchYearFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setImportBatchYearFilter(val);
                    loadImportBatches(val);
                  }}
                >
                  <option value="">Todos los años</option>
                  {[2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027].map((yr) => (
                    <option key={yr} value={String(yr)}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {importBatches.length === 0 ? (
              <p className="history-empty">Aún no hay importaciones registradas para este filtro.</p>
            ) : (
              <div className="import-preview-scroll">
                <table className="import-preview-table">
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th>Año</th>
                      <th>Archivo</th>
                      <th>Nuevos</th>
                      <th>Actualizados</th>
                      <th>Total filas</th>
                      <th>Fecha de carga</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importBatches.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <span className="badge badge-orange">
                            {b.mes ? `${b.mes} ${b.anio}` : b.periodo}
                          </span>
                        </td>
                        <td>{b.anio}</td>
                        <td>{b.archivo}</td>
                        <td><span className="badge badge-ok">{b.nuevos}</span></td>
                        <td><span className="badge badge-neutral">{b.actualizados}</span></td>
                        <td>{b.total_filas}</td>
                        <td className="mono-copy">
                          {new Date(b.created_at).toLocaleDateString('es-BO')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <footer className="dialog-footer dialog-footer-split">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => importDialogRef.current?.close()}
          >
            {importTab === 'history' ? 'Cerrar' : 'Cancelar'}
          </button>
          {importTab === 'new' && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                importLoading ||
                importPreview.length === 0 ||
                (importCounts.new === 0 &&
                  !(importDuplicateAction === 'update' && importCounts.duplicate_db > 0) &&
                  !(importRecordHistory && importCounts.duplicate_db > 0))
              }
              onClick={handleConfirmImport}
            >
              {importLoading
                ? 'Procesando...'
                : `Confirmar importación (${MONTH_NAMES[importMonth - 1]} ${importYear})`}
            </button>
          )}
        </footer>
      </dialog>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
