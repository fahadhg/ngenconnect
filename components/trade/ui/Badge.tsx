import clsx from 'clsx';

type BadgeVariant = 'high' | 'med' | 'low' | 'green' | 'red' | 'yellow' | 'blue' | 'orange' | 'default';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  high: 'bg-negative/10 text-negative border-negative/20',
  med: 'bg-warn/10 text-warn border-warn/20',
  low: 'bg-accent/10 text-accent border-accent/20',
  green: 'bg-positive/10 text-positive border-positive/20',
  red: 'bg-negative/10 text-negative border-negative/20',
  yellow: 'bg-warn/10 text-warn border-warn/20',
  blue: 'bg-accent/10 text-accent border-accent/20',
  orange: 'bg-ngen/10 text-ngen border-ngen/20',
  default: 'bg-surface-2 text-ink-muted border-border',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border',
      VARIANT_STYLES[variant],
      className
    )}>
      {children}
    </span>
  );
}

// Legacy support for the old Badge API
export function LegacyBadge({ t, s }: { t: string; s: 'high' | 'med' | 'low' }) {
  return <Badge variant={s}>{t}</Badge>;
}
