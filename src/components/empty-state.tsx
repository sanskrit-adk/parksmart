import { cn } from "@/lib/utils";

type Art = "search" | "calendar" | "garage" | "map" | "chart";

/** Friendly empty states with small inline illustrations (no external assets). */
export function EmptyState({
  art = "search",
  title,
  description,
  action,
  className,
}: {
  art?: Art;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <Illustration art={art} />
      <h3 className="mt-6 text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

function Illustration({ art }: { art: Art }) {
  return (
    <svg viewBox="0 0 160 120" className="h-28 w-36" aria-hidden>
      <ellipse cx="80" cy="108" rx="56" ry="7" className="fill-muted" />
      <rect x="22" y="18" width="116" height="80" rx="18" className="fill-card stroke-border" strokeWidth="2" />
      {art === "search" && (
        <>
          <circle cx="72" cy="54" r="20" className="fill-accent stroke-teal-strong" strokeWidth="5" />
          <path d="M87 69l16 16" className="stroke-teal-strong" strokeWidth="7" strokeLinecap="round" />
          <path d="M64 54h16M72 46v16" className="stroke-navy dark:stroke-teal" strokeWidth="4" strokeLinecap="round" opacity=".5" />
        </>
      )}
      {art === "calendar" && (
        <>
          <rect x="46" y="34" width="68" height="50" rx="10" className="fill-accent" />
          <rect x="46" y="34" width="68" height="14" rx="7" className="fill-teal" />
          {[0, 1, 2].map((r) =>
            [0, 1, 2, 3].map((c) => (
              <rect key={`${r}${c}`} x={53 + c * 15} y={54 + r * 9} width="9" height="5" rx="2" className={r === 1 && c === 2 ? "fill-navy dark:fill-teal" : "fill-border"} />
            )),
          )}
        </>
      )}
      {art === "garage" && (
        <>
          <path d="M44 84V50l36-18 36 18v34" className="fill-accent stroke-teal-strong" strokeWidth="4" strokeLinejoin="round" />
          <rect x="60" y="60" width="40" height="24" rx="4" className="fill-card stroke-border" strokeWidth="2" />
          <path d="M60 68h40M60 76h40" className="stroke-border" strokeWidth="2" />
        </>
      )}
      {art === "map" && (
        <>
          <path d="M40 38l26-8 28 8 26-8v52l-26 8-28-8-26 8z" className="fill-accent stroke-border" strokeWidth="2" />
          <path d="M80 36c-9 0-15 6-15 14 0 10 15 24 15 24s15-14 15-24c0-8-6-14-15-14z" className="fill-teal stroke-navy dark:stroke-teal" strokeWidth="2" />
          <circle cx="80" cy="50" r="5" className="fill-card" />
        </>
      )}
      {art === "chart" && (
        <>
          {[28, 44, 34, 56, 40].map((h, i) => (
            <rect key={i} x={46 + i * 14} y={86 - h} width="9" height={h} rx="3" className={i === 3 ? "fill-teal" : "fill-border"} />
          ))}
        </>
      )}
    </svg>
  );
}
