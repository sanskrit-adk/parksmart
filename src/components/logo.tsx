import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-navy dark:fill-teal" />
      <path
        d="M11 24V8h6.2c3.6 0 5.8 2 5.8 5.1 0 3.2-2.3 5.2-5.9 5.2H14.6V24H11Zm3.6-8.7h2.4c1.6 0 2.5-.8 2.5-2.2s-.9-2.1-2.5-2.1h-2.4v4.3Z"
        className="fill-white dark:fill-navy"
      />
      <circle cx="24.5" cy="7.5" r="3.5" className="fill-teal dark:fill-navy" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-bold tracking-tight", className)}>
      <LogoMark />
      <span className="text-lg">
        Park<span className="text-teal-strong">Smart</span>
      </span>
    </span>
  );
}
