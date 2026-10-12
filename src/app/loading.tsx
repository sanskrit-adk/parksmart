export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-64 animate-pulse rounded-xl bg-muted" />
      <div className="h-5 w-96 max-w-full animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-4 pt-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
