import Link from "next/link";
import type { Client } from "@ir/types";
import { CLIENT_KIND_LABELS, clientDisplayName } from "@ir/types";

function formatDoc(client: Client): string {
  const doc = client.kind === "individual" ? client.cpf : client.cnpj;
  if (!doc) return "—";
  return client.kind === "individual"
    ? doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/** Lista de clientes — tabela + versão em card pra mobile (mesma convenção
 * do editorial: filtro/busca/paginação ficam na página servidora, este
 * componente só renderiza o que já veio filtrado/paginado). */
export function ClientesList({ clients }: { clients: Client[] }): JSX.Element {
  if (clients.length === 0) {
    return <p className="helper-text">Nenhum cliente encontrado com os filtros atuais.</p>;
  }

  return (
    <>
      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Referência</th>
              <th>Nome / Razão social</th>
              <th>Tipo</th>
              <th>CPF/CNPJ</th>
              <th>Contato</th>
              <th>Status</th>
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
                </td>
                <td>{CLIENT_KIND_LABELS[client.kind]}</td>
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
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
