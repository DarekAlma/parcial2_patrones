const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export const money = (value?: number | null) => (value == null ? '—' : cop.format(value));

export function shortDate(iso?: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

export function timeAgo(iso?: string | null) {
  if (!iso) return '—';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'hace segundos';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `hace ${hours} h` : `hace ${Math.round(hours / 24)} días`;
}

export const duration = (minutes?: number | null) =>
  minutes == null ? '—' : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;

export function errorMessage(err: unknown) {
  if (!err) return '';
  const e = err as { graphQLErrors?: { message: string }[]; message?: string };
  return e.graphQLErrors?.[0]?.message ?? e.message ?? 'Error inesperado';
}

export const STEP_LABEL: Record<string, string> = {
  FLIGHT: 'Vuelo',
  HOTEL: 'Hotel',
  CAR: 'Auto',
  PAYMENT: 'Pago',
  CONFIRMATION: 'Factura y confirmación',
};

export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  PROCESSING: 'Procesando',
  CONFIRMED: 'Confirmada',
  COMPENSATED: 'Compensada',
  FAILED: 'Fallida',
  RUNNING: 'En curso',
  COMPLETED: 'Completada',
  PARTIAL: 'Parcial',
};
