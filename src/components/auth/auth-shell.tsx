import { SparklesIcon } from "lucide-react";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid flex-1 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-end">
        <div className="bg-grid absolute inset-0 opacity-60" aria-hidden />
        <div className="absolute -top-20 -left-20 size-96 rounded-full bg-teal/25 blur-3xl" aria-hidden />
        <div className="relative max-w-md space-y-4">
          <SparklesIcon className="size-8 text-teal" />
          <p className="text-3xl leading-tight font-bold">Parking that predicts. Booking that just works.</p>
          <p className="text-white/70">Save vehicles for one-tap plate check-in, keep favourite spots, and let the AI learn what you like.</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-2 mb-8 text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
