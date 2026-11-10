import Link from "next/link";
import type { Client } from "@ir/types";
import type { ClientAdminSortKey } from "../../providers/supabase/clientRepository.supabase";
import { CLIENT_KIND_LABELS, CLIENT_ROLE_LABELS, clientDisplayName } from "@ir/types";

function formatDoc(client: Client): string {
  const doc = client.kind === "individual" ? client.cpf : client.cnpj;
  if (!doc) return "—";
  return client.kind === "individual"
    ? doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : doc.replace(/([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})([0-9]{2})/i, "$1.$2.$3/$4-$5");
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
export function ClientesList({clients, sortHrefs, sortBy, sortDir}:{
  clients:Client[];
  sortHrefs:Record<ClientAdminSortKey,string>;
  sortBy?:ClientAdminSortKey;
  sortDir:"asc"|"desc";
}):JSX.Element {
  const sortableHeader = (key:ClientAdminSortKey,label:string):JSX.Element => (
    <Link className="cadastros-sort-link" href={sortHrefs[key]}
      aria-label={`Ordenar ${label} ${sortBy === key && sortDir === "asc" ? "decrescente" : "crescente"}`}>
      {label} <span className="cadastros-sort-hint" aria-hidden="true">{sortBy === key ? sortDir === "asc" ? "↑" : "↓" : "↕"}</span>
    </Link>
  );
  if (clients.length === 0) {
    return <p className="helper-text">Nenhum cadastro encontrado com os filtros atuais.</p>;
  }

  return (
    <>
      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>{sortableHeader("reference","Referência")}</th>
              <th>{sortableHeader("name","Nome / Razão social")}</th>
              <th>Papéis</th>
              <th>{sortableHeader("document","CPF/CNPJ")}</th>
              <th>Contato</th>
              <th>{sortableHeader("status","Status")}</th>
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
