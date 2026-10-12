import { ChevronDownIcon } from "lucide-react"
import * as React from "react"
import { cn } from "cn"

/** Styled native <select>: best-in-class on mobile, fully accessible. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        data-slot="native-select"
        className="h-11 w-full appearance-none rounded-xl border border-input bg-card pr-9 pl-3.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive md:text-sm"
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  )
}

export { NativeSelect }
