"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface BirthdayClientRow {
  id: string;
  kind: "individual" | "company";
  name: string;
  city: string;
  birthDate: string | null;
}

function shortBirthDate(date: string): string {
  const parts = date.split("-");
  return parts.length === 3 ? parts[2] + "/" + parts[1] : date;
}

function dateKey(date: string): number {
  return Number(date.slice(5, 7) + date.slice(8, 10));
}

export function ClientBirthdayDirectory({ clients }: { clients: BirthdayClientRow[] }): JSX.Element {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => clients.filter((client) =>
    [client.name, client.city].join(" ").toLocaleLowerCase("pt-BR")
      .includes(search.trim().toLocaleLowerCase("pt-BR"))), [clients, search]);

  const dated = filtered.filter((c) => c.kind === "individual" && c.birthDate)
    .sort((a, b) => dateKey(a.birthDate!).valueOf() - dateKey(b.birthDate!).valueOf() ||
      a.name.localeCompare(b.name, "pt-BR"));
  const pending = filtered.filter((c) => c.kind === "individual" && !c.birthDate)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const companies = filtered.filter((c) => c.kind === "company")
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="aniv-module">
      <div className="form-section form-section--first">
        <h2>Aniversariantes vinculados ao Cadastro</h2>
        <p className="helper-text">
          As datas de nascimento das pessoas físicas vêm diretamente do cadastro mestre do Jornal IR.
          Basta preencher ou corrigir a data no cadastro: ela aparecerá aqui sem criar outra pessoa.
        </p>
        <p className="helper-text">
          Empresas não têm data de nascimento pessoal; para o aniversário de responsáveis
          ou familiares, cada pessoa precisará de um cadastro próprio ou vínculo editorial.
        </p>
        <label className="form-field" style={{ maxWidth: 450 }}>
          <span className="field-label">Localizar cadastro por nome ou cidade</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar clientes cadastrados" />
        </label>
      </div>

      <section className="form-section">
        <h2>Pessoas com nascimento informado ({dated.length})</h2>
        {dated.length === 0 ? (
          <p className="helper-text">Ainda não há data de nascimento informada nos cadastros exibidos.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {dated.map((person) => (
              <div key={person.id} className="aniv-entry" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
                <div>
                  <strong>{person.name}</strong>
                  <span className="helper-text" style={{ display: "block" }}>
                    {shortBirthDate(person.birthDate!)} · {person.city || "Cidade não informada"}
                  </span>
                </div>
                <Link href={`/sistema/clientes/${person.id}/editar`} className="secondary-link">Editar cadastro</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="form-section">
        <h2>Pessoas aguardando nascimento ({pending.length})</h2>
        {pending.length === 0 ? <p className="helper-text">Nenhuma pessoa aguardando data.</p> : (
          <div style={{ display: "grid", gap: 8 }}>
            {pending.map((person) => (
              <div key={person.id} className="aniv-entry" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
                <div><strong>{person.name}</strong><span className="helper-text" style={{ display: "block" }}>Nascimento não informado · {person.city || "Cidade não informada"}</span></div>
                <Link className="form-action-primary" href={`/sistema/clientes/${person.id}/editar`}>Informar nascimento</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="form-section">
        <h2>Empresas vinculadas ({companies.length})</h2>
        {companies.length === 0 ? <p className="helper-text">Nenhuma empresa cadastrada.</p> : (
          <div style={{ display: "grid", gap: 8 }}>
            {companies.map((company) => (
              <div key={company.id} className="aniv-entry" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
                <div><strong>{company.name}</strong><span className="helper-text" style={{ display: "block" }}>{company.city || "Cidade não informada"} · Pessoa jurídica</span></div>
                <Link className="secondary-link" href={`/sistema/clientes/${company.id}`}>Ver cadastro</Link>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="helper-text">Esta lista é sincronizada com Cadastros; as mensagens editoriais e os registros manuais de aniversariantes serão habilitados após a integração de persistência do módulo, para não aparentar que dados temporários foram salvos.</p>
    </div>
  );
}
