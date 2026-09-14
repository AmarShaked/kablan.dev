import { cn } from '@/lib/utils';
import type { LinearStatusType } from '@/lib/integrations/linear';

const SIZE = {
  sm: { box: 'h-3.5 w-3.5', stroke: 1.75 },
  md: { box: 'h-4 w-4', stroke: 1.75 },
} as const;

function normalizeColor(color: string | null | undefined): string {
  if (!color) return '#95a2b3';
  return color.startsWith('#') ? color : `#${color}`;
}

function StatusIcon({
  type,
  color,
  size,
  name,
}: {
  type: LinearStatusType | null;
  color: string;
  size: keyof typeof SIZE;
  name: string;
}) {
  const { box, stroke } = SIZE[size];
  const common = {
    className: cn(box, 'shrink-0'),
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': true as const,
  };
  const isDuplicate =
    type === 'canceled' && /duplicate/i.test(name.trim());

  switch (type) {
    case 'triage':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" fill={color} />
          <path
            d="M5.5 6.2 8 4.2 10.5 6.2M5.5 9.8 8 11.8 10.5 9.8"
            stroke="white"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'backlog':
      return (
        <svg {...common}>
          <circle
            cx="8"
            cy="8"
            r="5.5"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray="1.6 2.2"
          />
        </svg>
      );
    case 'unstarted':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" stroke={color} strokeWidth={stroke} />
        </svg>
      );
    case 'started':
      return (
        <svg {...common}>
          <circle
            cx="8"
            cy="8"
            r="5.5"
            stroke={color}
            strokeWidth={stroke}
            opacity={0.35}
          />
          <path
            d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        </svg>
      );
    case 'completed':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" fill={color} />
          <path
            d="M5.2 8.2 7.1 10.1 10.9 5.8"
            stroke="white"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'canceled':
      if (isDuplicate) {
        return (
          <svg {...common}>
            <circle cx="8" cy="8" r="5.5" stroke={color} strokeWidth={stroke} />
            <path
              d="M4.8 11.2 11.2 4.8"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
            />
          </svg>
        );
      }
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" stroke={color} strokeWidth={stroke} />
          <path
            d="M5.4 5.4 10.6 10.6M10.6 5.4 5.4 10.6"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" stroke={color} strokeWidth={stroke} />
        </svg>
      );
  }
}

export function LinearStatusBadge({
  name,
  type,
  color,
  size = 'sm',
  showLabel = true,
  className,
}: {
  name: string;
  type: LinearStatusType | null;
  color?: string | null;
  size?: keyof typeof SIZE;
  showLabel?: boolean;
  className?: string;
}) {
  const resolved = normalizeColor(color);
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 text-[13px]',
        className
      )}
      title={name}
    >
      <StatusIcon type={type} color={resolved} size={size} name={name} />
      {showLabel && <span className="min-w-0 truncate">{name}</span>}
    </span>
  );
}

export function linearStatusTypeFromName(
  typeName: string | null | undefined
): LinearStatusType | null {
  switch (typeName) {
    case 'triage':
    case 'backlog':
    case 'unstarted':
    case 'started':
    case 'completed':
    case 'canceled':
      return typeName;
    default:
      return null;
  }
}
