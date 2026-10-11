import Link from "next/link";
import type { Client } from "@ir/types";
import { CLIENT_KIND_LABELS, CLIENT_ROLE_LABELS, clientDisplayName } from "@ir/types";

function formatDoc(client: Client): string {
  const doc = client.kind === "individual" ? client.cpf : client.cnpj;
  if (!doc) return "—";
  return client.kind === "individual"
    ? doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function RolesBadges({ client }: { client: Client }): JSX.Element {
  if (client.roles.length === 0) return <span className="cadastro-kind-hint">—</span>;
  return (
    <span className="cadastro-roles">
      {client.roles.map((role) => (
        <span key={role} className="cadastro-role-badge">
          {CLIENT_ROLE_LABELS[role]}
        </span>
      ))}
    </span>
  );
}

/**
 * Lista de clientes ("Cadastros") — tabela + versão em card pra mobile
 * (mesma convenção do editorial: filtro/busca/paginação ficam na página
 * servidora, este componente só renderiza o que já veio filtrado/paginado).
 *
 * Ordenação (Fase 7 da padronização): os cabeçalhos abaixo só têm o
 * indicador visual (↕, apagado) — `listClientsAdminPageSupabase` não
 * aceita `sortBy`/`sortDir` hoje, então deixá-los clicáveis sem isso
 * mudaria a URL sem nunca reordenar o resultado (enganoso). Fica preparado
 * pro CSS/visual; a lógica real depende de um ajuste no provider, fora do
 * escopo desta tarefa.
 */
export function ClientesList({ clients }: { clients: Client[] }): JSX.Element {
  if (clients.length === 0) {
    return <p className="helper-text">Nenhum cadastro encontrado com os filtros atuais.</p>;
  }

  return (
    <>
      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Referência <span className="cadastros-sort-hint" aria-hidden="true">↕</span></th>
              <th>Nome / Razão social <span className="cadastros-sort-hint" aria-hidden="true">↕</span></th>
              <th>Papéis</th>
              <th>CPF/CNPJ <span className="cadastros-sort-hint" aria-hidden="true">↕</span></th>
              <th>Contato</th>
              <th>Status <span className="cadastros-sort-hint" aria-hidden="true">↕</span></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id}>
                <td className="materia-reference">{client.reference}</td>
                <td>
                  <Link className="materia-title materia-title-link" href={`/sistema/clientes/${client.id}`}>
                    {clientDisplayName(client)}
                  </Link>
                  <span className="cadastro-kind-hint">{CLIENT_KIND_LABELS[client.kind]}</span>
                </td>
                <td>
                  <RolesBadges client={client} />
                </td>
                <td>{formatDoc(client)}</td>
                <td>{client.email || client.phonePrimary || client.whatsapp || "—"}</td>
                <td>
                  <span className={`status-pill status-pill--${client.status === "active" ? "published" : "archived"}`}>
                    {client.status === "active" ? "Ativo" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="materias-cards">
        {clients.map((client) => (
          <li key={client.id}>
            <Link className="materia-card" href={`/sistema/clientes/${client.id}`}>
              <div className="materia-card-head">
                <span className="materia-card-title">{clientDisplayName(client)}</span>
                <span className={`status-pill status-pill--${client.status === "active" ? "published" : "archived"}`}>
                  {client.status === "active" ? "Ativo" : "Inativo"}
                </span>
              </div>
              <span className="materia-card-meta">{CLIENT_KIND_LABELS[client.kind]} · {formatDoc(client)}</span>
              <span className="materia-card-meta">{client.email || client.phonePrimary || client.whatsapp || "—"}</span>
              <RolesBadges client={client} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
