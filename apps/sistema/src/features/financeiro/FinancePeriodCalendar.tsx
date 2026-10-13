"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface FinancePeriodCalendarProps {
  initialStart: string;
  initialEnd: string;
  today: string;
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function ymd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function label(value: string): string {
  return parseDate(value).toLocaleDateString("pt-BR");
}

function monthLabel(year: number, month: number): string {
  const text = new Date(year, month, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function startOfWeek(value: string): string {
  const date = parseDate(value);
  const weekday = date.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + diff);
  return ymd(date);
}

function endOfWeek(value: string): string {
  const date = parseDate(startOfWeek(value));
  date.setDate(date.getDate() + 6);
  return ymd(date);
}

export function FinancePeriodCalendar({
  initialStart,
  initialEnd,
  today,
}: FinancePeriodCalendarProps): JSX.Element {
  const router = useRouter();
  const initialMonth = parseDate(initialStart);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initialMonth.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialMonth.getMonth());
  const [draftStart, setDraftStart] = useState(initialStart);
  const [draftEnd, setDraftEnd] = useState<string | null>(initialEnd);

  const days = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const firstWeekday = first.getDay();
    const mondayIndex = firstWeekday === 0 ? 6 : firstWeekday - 1;
    const gridStart = new Date(viewYear, viewMonth, 1 - mondayIndex);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return {
        value: ymd(date),
        day: date.getDate(),
        currentMonth: date.getMonth() === viewMonth,
      };
    });
  }, [viewMonth, viewYear]);

  function applyRange(start: string, end: string): void {
    const params = new URLSearchParams();
    params.set("periodStart", start);
    params.set("periodEnd", end);
    setOpen(false);
    router.push(`/sistema/financeiro?${params.toString()}`);
  }

  function chooseDay(value: string): void {
    if (draftEnd !== null) {
      setDraftStart(value);
      setDraftEnd(null);
      return;
    }

    const start = value < draftStart ? value : draftStart;
    const end = value < draftStart ? draftStart : value;
    setDraftStart(start);
    setDraftEnd(end);
    applyRange(start, end);
  }

  function moveMonth(delta: number): void {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function currentWeek(): void {
    const start = startOfWeek(today);
    const end = endOfWeek(today);
    setDraftStart(start);
    setDraftEnd(end);
    const month = parseDate(start);
    setViewYear(month.getFullYear());
    setViewMonth(month.getMonth());
    applyRange(start, end);
  }

  const effectiveEnd = draftEnd ?? draftStart;

  return (
    <div style={{ position: "relative", maxWidth: 440 }}>
      <button
        type="button"
        className="header-action"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        style={{ width: "100%", justifyContent: "space-between", display: "flex", gap: 16 }}
      >
        <span>Período: {label(initialStart)} até {label(initialEnd)}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            zIndex: 50,
            top: "calc(100% + 8px)",
            left: 0,
            width: "min(390px, calc(100vw - 40px))",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 14,
            background: "var(--surface, #fff)",
            boxShadow: "0 18px 42px rgba(0,0,0,.14)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior">‹</button>
            <strong>{monthLabel(viewYear, viewMonth)}</strong>
            <button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês">›</button>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              textAlign: "center",
              fontSize: 11,
              fontWeight: 800,
              color: "var(--muted)",
            }}
          >
            {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((item) => (
              <span key={item} style={{ padding: "5px 0" }}>{item}</span>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3 }}>
            {days.map((item) => {
              const inRange = item.value >= draftStart && item.value <= effectiveEnd;
              const endpoint = item.value === draftStart || item.value === draftEnd;
              const isToday = item.value === today;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => chooseDay(item.value)}
                  title={item.value}
                  style={{
                    minHeight: 38,
                    borderRadius: 7,
                    border: isToday ? "1px solid #b6242d" : "1px solid transparent",
                    background: endpoint
                      ? "var(--brand-navy)"
                      : inRange
                        ? "rgba(37,36,86,.10)"
                        : "transparent",
                    color: endpoint
                      ? "#fff"
                      : item.currentMonth
                        ? "var(--ink)"
                        : "var(--muted)",
                    cursor: "pointer",
                    fontWeight: endpoint || isToday ? 800 : 500,
                  }}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <span className="helper-text">
              {draftEnd
                ? `${label(draftStart)} até ${label(draftEnd)}`
                : `Início: ${label(draftStart)} · escolha a data final`}
            </span>
            <button type="button" onClick={currentWeek}>Semana atual</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
