interface StatusBadgeProps {
  status: "ativo" | "inativo";
}

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  const active = status === "ativo";
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"}`}>
      {status}
    </span>
  );
}
