import { useMemo } from 'react';

/**
 * Guilloché del papel de seguridad: curvas hipotrocoides y ondas trenzadas,
 * como las de los bonos y tiquetes impresos. Se calcula una sola vez y se
 * dibuja como SVG en línea (sin imágenes externas, compatible con la CSP).
 */
function rosette(cx: number, cy: number, R: number, r: number, d: number, steps = 1400) {
  const pts: string[] = [];
  const turns = r / gcd(R, r);
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const x = cx + (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = cy + (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${pts.join('L')}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function waves(width: number, height: number, lines: number, amp: number, period: number) {
  const paths: string[] = [];
  for (let l = 0; l < lines; l += 1) {
    const y0 = (height / (lines + 1)) * (l + 1);
    const phase = (l % 2 ? Math.PI : 0) + l * 0.35;
    const pts: string[] = [];
    for (let x = 0; x <= width; x += 6) {
      const y = y0 + Math.sin((x / period) * Math.PI * 2 + phase) * amp;
      pts.push(`${x},${y.toFixed(1)}`);
    }
    paths.push(`M${pts.join('L')}`);
  }
  return paths;
}

export function Guilloche({ variant = 'rosette', className }: { variant?: 'rosette' | 'waves'; className?: string }) {
  const paths = useMemo(() => {
    if (variant === 'waves') return waves(600, 160, 9, 7, 120);
    return [rosette(220, 220, 150, 42, 96), rosette(220, 220, 150, 54, 70), rosette(220, 220, 120, 33, 58)];
  }, [variant]);
  const viewBox = variant === 'waves' ? '0 0 600 160' : '0 0 440 440';
  return (
    <svg className={className} viewBox={viewBox} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={0.6} />
      ))}
    </svg>
  );
}

/** Línea de microimpresión de papel de seguridad (texto diminuto repetido). */
export function Microprint({ text = 'WANDERSYNC TRAVEL SOLUTIONS · BONO DE VIAJE · ' }: { text?: string }) {
  return (
    <div className="microprint" aria-hidden="true">
      {text.repeat(12)}
    </div>
  );
}

export type StampTone = 'ok' | 'void' | 'pending' | 'fail';

/** Sello de goma: borde doble, texto en mayúsculas, leve rotación y tinta irregular. */
export function Stamp({ label, tone, size = 'md', note }: { label: string; tone: StampTone; size?: 'sm' | 'md' | 'lg'; note?: string }) {
  return (
    <span className={`stamp stamp-${tone} stamp-${size}`} role="status">
      <span className="stamp-label">{label}</span>
      {note && <span className="stamp-note">{note}</span>}
    </span>
  );
}
