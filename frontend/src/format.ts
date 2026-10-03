const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

export const money = (value?: number | null) => (value == null ? '—' : cop.format(value));
/** Monto sin símbolo, para cifras grandes donde el "$" va aparte. */
export const amount = (value?: number | null) => (value == null ? '—' : plain.format(value));

export function shortDate(iso?: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

/** "27–30 oct" o "30 oct – 2 nov": rango corto para los tiquetes. */
export function dateRange(from: string, to: string) {
  const a = new Date(`${from.slice(0, 10)}T12:00:00`);
  const b = new Date(`${to.slice(0, 10)}T12:00:00`);
  const month = (d: Date) => d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${month(b)}`
    : `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)}`;
}

export function longDate(iso?: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'long' });
}

export function timeAgo(iso?: string | null) {
  if (!iso) return '—';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'hace segundos';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `hace ${hours} h` : `hace ${Math.round(hours / 24)} días`;
}

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export const duration = (minutes?: number | null) =>
  minutes == null ? '—' : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;

export function errorMessage(err: unknown) {
  if (!err) return '';
  const e = err as { graphQLErrors?: { message: string }[]; message?: string };
  return e.graphQLErrors?.[0]?.message ?? e.message ?? 'Error inesperado';
}

/** Código del bono: WS-CTG-1027 (destino + mes/día de salida). */
export function voucherCode(searchKey: string) {
  const [, dest, , month, day] = searchKey.split('-');
  return `WS-${dest}-${month}${day}`;
}

/** Número de serie de una orden emitida: WS-CTG-AB25. */
export function orderCode(searchKey: string, id: string) {
  return `WS-${searchKey.split('-')[1]}-${id.slice(0, 4).toUpperCase()}`;
}

export const STEP_LABEL: Record<string, string> = {
  FLIGHT: 'Vuelo',
  HOTEL: 'Hotel',
  CAR: 'Auto',
  PAYMENT: 'Pago',
  CONFIRMATION: 'Factura',
};

export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  PROCESSING: 'En trámite',
  CONFIRMED: 'Confirmado',
  COMPENSATED: 'Anulado',
  FAILED: 'Fallido',
  RUNNING: 'En curso',
  COMPLETED: 'Completada',
  PARTIAL: 'Parcial',
};

export const DESTINATION_NAME: Record<string, string> = {
  CTG: 'Cartagena',
  SMR: 'Santa Marta',
  MDE: 'Medellín',
  CLO: 'Cali',
  BOG: 'Bogotá',
};

/** Traduce códigos que llegan del backend (enums en inglés) a lenguaje del bono. */
const STEP_ES: Record<string, string> = { FLIGHT: 'el vuelo', HOTEL: 'el hotel', CAR: 'el auto', PAYMENT: 'el pago' };
const BACKEND_WORDS: [RegExp, string][] = [
  [/\bALREADY_CANCELLED\b/g, 'ya estaba cancelada'],
  [/\bNOTHING_TO_COMPENSATE\b/g, 'nada que compensar'],
  [/\bNO_AVAILABILITY\b/g, 'sin disponibilidad'],
  [/\bCANCELLED\b/g, 'cancelada'],
  [/\bREFUNDED\b/g, 'reembolsado'],
];

export function humanReason(text: string) {
  let out = text.replace(/Falló (FLIGHT|HOTEL|CAR|PAYMENT)\b/g, (_m, step: string) => `Falló ${STEP_ES[step]}`);
  for (const [re, word] of BACKEND_WORDS) out = out.replace(re, word);
  return out;
}
