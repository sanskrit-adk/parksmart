"use client";

import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

export interface SeriesPoint {
  label: string;
  value: number;
  /** Optional emphasised point (e.g. "now" or "best time"). */
  highlight?: boolean;
}

/**
 * Single-series chart following the dataviz spec: one hue, no legend (the
 * title names the series), thin marks with 4px rounded data-ends, recessive
 * grid, hover tooltip on every mark, and a table view for screen readers.
 */
export function SeriesChart({
  data,
  kind = "bar",
  title,
  valueLabel,
  format = (v) => String(v),
  height = 200,
  yMax,
  className,
}: {
  data: SeriesPoint[];
  kind?: "bar" | "area";
  title: string;
  valueLabel: string;
  format?: (v: number) => string;
  height?: number;
  yMax?: number;
  className?: string;
}) {
  const [table, setTable] = useState(false);
  return (
    <figure className={cn("w-full", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <figcaption className="text-sm font-semibold">{title}</figcaption>
        <button type="button" onClick={() => setTable((t) => !t)} className="text-xs font-medium text-teal-strong hover:underline" aria-pressed={table}>
          {table ? "Show chart" : "View as table"}
        </button>
      </div>
      {table ? (
        <div className="max-h-64 overflow-y-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 text-right font-medium">{valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-1.5">{d.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label={`${title}. ${data.length} points. Use “View as table” for values.`}>
          <ResponsiveContainer width="100%" height="100%">
            {kind === "bar" ? (
              <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={format} domain={[0, yMax ?? "auto"]} width={48} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip valueLabel={valueLabel} format={format} />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false}>
                  {data.map((d, i) => (
                    <Cell key={i} fill="var(--teal-strong)" fillOpacity={d.highlight || !data.some((x) => x.highlight) ? 1 : 0.45} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <AreaChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="series-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--teal-strong)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--teal-strong)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={20} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={format} domain={[0, yMax ?? "auto"]} width={48} />
                <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} content={<ChartTooltip valueLabel={valueLabel} format={format} />} />
                <Area type="monotone" dataKey="value" stroke="var(--teal-strong)" strokeWidth={2} fill="url(#series-fill)" activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  valueLabel,
  format,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  valueLabel: string;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-soft">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        {valueLabel}: <span className="font-semibold text-foreground tabular-nums">{format(payload[0].value)}</span>
      </p>
    </div>
  );
}
