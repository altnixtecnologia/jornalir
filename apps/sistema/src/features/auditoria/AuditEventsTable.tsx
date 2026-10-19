"use client";

import { useState } from "react";
import type { AuditEventRow } from "../../providers/supabase/auditEvents.supabase";
import { describeEvent, detailMetadataEntries, moduleLabel, originLabel, resultLabel } from "./auditEventPresentation";

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

export function AuditEventsTable({ rows }: { rows: AuditEventRow[] }): JSX.Element {
  const [selected, setSelected] = useState<AuditEventRow | null>(null);

  return (
    <>
      <div className="materias-table-wrap">
        <table className="materias-table audit-events-table">
          <thead>
            <tr>
              <th>Data e hora</th>
              <th>Responsável</th>
              <th>Módulo</th>
              <th>Acontecimento</th>
              <th>Registro afetado</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="helper-text">Nenhum evento encontrado para os filtros atuais.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="audit-events-row" onClick={() => setSelected(row)} tabIndex={0}
                  onKeyDown={(event) => { if (event.key === "Enter") setSelected(row); }}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{originLabel(row)}</td>
                  <td>{moduleLabel(row.entityType)}</td>
                  <td>{describeEvent(row)}</td>
                  <td className="audit-events-entity-id" title={row.entityId}>{row.entityId.slice(0, 8)}…</td>
                  <td>
                    <span className={`audit-result-badge audit-result-${resultLabel(row).toLowerCase()}`}>{resultLabel(row)}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="audit-detail-overlay" role="presentation" onClick={() => setSelected(null)}>
          <div className="audit-detail-modal" role="dialog" aria-modal="true" aria-label="Detalhe do evento de auditoria" onClick={(event) => event.stopPropagation()}>
            <div className="audit-detail-header">
              <h2>Detalhe do evento</h2>
              <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => setSelected(null)}>✕</button>
            </div>
            <dl className="audit-detail-list">
              <dt>Data e hora</dt>
              <dd>{formatDateTime(selected.createdAt)}</dd>
              <dt>Responsável</dt>
              <dd>{originLabel(selected)}</dd>
              <dt>Módulo</dt>
              <dd>{moduleLabel(selected.entityType)}</dd>
              <dt>Acontecimento</dt>
              <dd>{describeEvent(selected)}</dd>
              <dt>Resultado</dt>
              <dd>{resultLabel(selected)}</dd>
              {detailMetadataEntries(selected).map(([label, value]) => (
                <div className="audit-detail-extra" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </>
  );
}
