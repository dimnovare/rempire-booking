"use client";

/**
 * The week's dark bar, the day's own (PhoneBar): «23–29 ноября ▾» (a ▾ opens
 * a date, and the week of that date opens), «Сегодня» when this week is not
 * the one shown, and «День | Неделя» where the day has it (Dim, 26.11.2026:
 * option А of the board «День | Неделя на телефоне»).
 */
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { PhoneBar } from "../../../admin/(app)/journal-grid";
import "../day-grid.css";

export function WeekBar({
  title,
  titleShort,
  date,
  pickLabel,
  todayLabel,
  children,
}: {
  title: string;
  titleShort: string;
  /** the date the picker opens on: today in this week, else the week's Monday */
  date: string;
  pickLabel: string;
  /** «Сегодня»: only when this week is not the one shown */
  todayLabel: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <PhoneBar
      title={title}
      titleShort={titleShort}
      date={date}
      pickLabel={pickLabel}
      onPick={(d) => router.replace(`/b/week?d=${d}`)}
      today={todayLabel ? { label: todayLabel, go: () => router.replace("/b/week") } : null}
    >
      {children}
    </PhoneBar>
  );
}
