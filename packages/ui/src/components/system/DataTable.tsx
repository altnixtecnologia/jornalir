import { StatusBadge } from "./StatusBadge";

type Row = Record<string, string | number> & { id: string; status: "ativo" | "inativo" };

interface DataTableProps {
  rows: Row[];
  columns: Array<{ key: string; label: string }>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
}

export function DataTable({ rows, columns, onEdit, onDelete, onToggleStatus }: DataTableProps): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 text-left font-semibold">
                {column.label}
              </th>
            ))}
            <th className="px-4 py-3 text-left font-semibold">Status</th>
            <th className="px-4 py-3 text-left font-semibold">Acoes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3">{String(row[column.key] ?? "-")}</td>
              ))}
              <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded bg-sky-100 px-2 py-1 text-xs text-sky-700" onClick={() => onEdit(row.id)}>Editar</button>
                  <button type="button" className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-700" onClick={() => onToggleStatus(row.id)}>
                    {row.status === "ativo" ? "Inativar" : "Ativar"}
                  </button>
                  <button type="button" className="rounded bg-rose-100 px-2 py-1 text-xs text-rose-700" onClick={() => onDelete(row.id)}>Remover</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
