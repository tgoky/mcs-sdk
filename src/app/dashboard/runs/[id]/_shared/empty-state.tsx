import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl no-ambient-glow surface-glass-1 px-6 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-500">
        <Icon size={18} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</p>
        <p className="mx-auto max-w-sm text-xs text-zinc-500 dark:text-zinc-500">{description}</p>
      </div>
    </div>
  );
}
