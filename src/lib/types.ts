export type Rubro =
  | 'profesional'
  | 'industrial'
  | 'alquiler'
  | 'empresa'
  | 'unipersonal'
  | 'otro';
export type ClientEstado = 'Activo' | 'Inactivo / Suspendido' | 'Baja';

export interface User {
  id: number;
  full_name: string;
  username: string;
  email: string;
}

export interface Client {
  id: number;
  razon_social: string;
  nit: string;
  fecha_ingreso: string;
  fecha_baja: string;
  fecha_inactivacion: string;
  direccion: string;
  correo: string;
  contrasena_correo: string;
  contrasena_siat: string;
  rubro: Rubro;
  rubro_especifico: string;
  ci_numero: string;
  ci_extension: string;
  fecha_pago: number | null;
  mes_cierre: string;
  honorarios_profesionales: number;
  declaraciones_juradas: string;
  estados_financieros: string;
  dictamen: string;
  saldo_iva: number;
  saldo_it: number;
  celular: string;
  estado: ClientEstado;
  notas: string;
  token_id?: number | null;
  vigencia_token?: string | null;
  vigencia_firma?: string | null;
  modalidad_facturacion?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ClientToken {
  id: number;
  client_id: number | null;
  client_nit?: string | null;
  client_estado?: string | null;
  nombre_cliente: string;
  modalidad_asignada: string;
  grupo: string;
  fecha_adecuacion: string;
  vigencia_token: string;
  vigencia_firma: string;
  correo_electronico: string;
  clave_correo?: string;
  contrasena_outlook: string;
  contrasena_gmail: string;
  contrasena_digicert: string;
  created_at?: string;
  updated_at?: string;
}

export interface ClientHistoryRecord {
  id: number;
  client_id: number;
  periodo: string;
  fecha_registro: string;
  tipo_evento: string;
  estado_pago: 'Pagado' | 'Pendiente' | 'Observado';
  monto_honorarios: number;
  saldo_iva: number;
  saldo_it: number;
  formularios: string;
  observaciones: string;
  created_at?: string;
}

export interface ClientStats {
  total: number;
  activos: number;
  inactivos: number;
  bajas: number;
  ddjj_pendientes: number;
}

export interface FinancialSummary {
  totalHonorariosActivos: number;
  proyeccionAnualHonorarios: number;
  promedioHonorariosActivos: number;
  totalSaldoIva: number;
  totalSaldoIt: number;
  totalSaldosFiscales: number;
  porRubro: Record<Rubro, { count: number; honorarios: number }>;
}
