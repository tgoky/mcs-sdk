export default function TeammatesLoading() {
  return (
    <div className="flex flex-col h-full w-full mx-auto tracking-tight antialiased font-sans px-1">
      <div className="flex-1 min-h-0 flex gap-3">
        <div className="w-56 shrink-0 rounded-xl border border-zinc-200 dark:border-zinc-800/80 p-1.5 space-y-1">
          <div className="h-8 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 rounded-lg bg-zinc-50 dark:bg-zinc-900/50" />
          ))}
        </div>
        <div className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800/80" />
      </div>
    </div>
  );
}