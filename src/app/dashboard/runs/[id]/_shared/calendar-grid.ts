// src/app/dashboard/runs/[id]/_shared/calendar-grid.ts
//
// Pure month-grid math, extracted out of pre-call-read-view.tsx so the new
// engagement-level roster calendar (app/dashboard/engagements/[id]/
// roster-calendar.tsx) can reuse the exact same grid layout and date
// bucketing instead of re-deriving it — same visual grid, two different
// data sources (one run's calls vs. an engagement's whole roster).

export function getDaysInMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday = 0

  const days: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = startDayOfWeek; i > 0; i--) days.push({ date: new Date(year, month, 1 - i), isCurrentMonth: false });
  for (let i = 1; i <= lastDay.getDate(); i++) days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  const remaining = (days.length > 35 ? 42 : 35) - days.length;
  for (let i = 1; i <= remaining; i++) days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
  return days;
}

export function dateKey(d: Date | string) {
  return new Date(d).toISOString().slice(0, 10);
}

export function timeStr(d: string) {
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
