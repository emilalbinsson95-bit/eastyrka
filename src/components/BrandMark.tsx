import { cn } from "@/lib/utils";

/**
 * SETPOINT brand mark — clinical precision.
 * A thin square frame with a baseline and a rising data point.
 * Renders inline as SVG so it inherits currentColor and stays crisp at any size.
 */
export function BrandMark({
  className,
  showWordmark = false,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="h-5 w-5"
      >
        {/* frame */}
        <rect
          x="2.5"
          y="2.5"
          width="19"
          height="19"
          rx="2"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="1"
        />
        {/* baseline */}
        <line
          x1="5"
          y1="15"
          x2="19"
          y2="15"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="1"
          strokeDasharray="1.5 1.5"
        />
        {/* rising line */}
        <path
          d="M5 17 L10 13 L14 14 L19 7"
          stroke="hsl(var(--primary) / 1)"
          className="stroke-primary"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* setpoint dot */}
        <circle cx="19" cy="7" r="1.75" className="fill-primary" />
      </svg>
      {showWordmark && (
        <span className="font-mono text-sm font-semibold tracking-[0.18em] uppercase">
          SETPOINT
        </span>
      )}
    </span>
  );
}
