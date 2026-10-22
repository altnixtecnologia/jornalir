"use client";

import Link from "next/link";
import { ModuleHeader } from "../../components/admin/ModuleHeader";
import { useAuth } from "../../lib/auth/AuthProvider";
import { useStaffModuleVisibility } from "../../lib/permissions/useStaffModuleVisibility";
import { useAgendaPautaReadAccess } from "../../lib/permissions/useAgendaPautaReadAccess";

const QUICK_LINKS = [
  { label: "Agenda e pauta", href: "/sistema/agenda", description: "Compromissos da equipe e o que cada um precisa fazer na semana." },
  { label: "Matérias", href: "/sistema/editorial/materias", description: "Ver, filtrar e abrir tudo o que já foi cadastrado." },
  { label: "Importar PDF", href: "/sistema/editorial/importar-pdf", description: "Extrair candidatos a matéria do jornal impresso." },
  { label: "Mídias", href: "/sistema/editorial/midias", description: "Buscar, cadastrar e revisar imagens da biblioteca." },
  { label: "Editorias", href: "/sistema/editorial/editorias", description: "Gerenciar os assuntos do jornal." },
  { label: "Abrangências", href: "/sistema/editorial/localidades", description: "Cadastrar e editar cidades, estados e regiões." },
  { label: "Clientes", href: "/sistema/clientes", description: "Cadastro central de pessoas e empresas." },
  { label: "Assinaturas", href: "/sistema/assinaturas", description: "Serviços (impresso, digital, TV) vinculados a um cliente." },
  { label: "Contas a receber", href: "/sistema/financeiro/contas-a-receber", description: "Títulos, recebimentos e situação de cada cliente." },
  { label: "Publicidade", href: "/sistema/publicidade", description: "Vendas comerciais, anunciantes e vínculo com o Financeiro." },
  { label: "NFS-e", href: "/sistema/nfse", description: "Configuração fiscal, rascunhos e notas emitidas." },
];

export default function SistemaHomePage(): JSX.Element {
  const { profile } = useAuth();
  const { hasModule } = useStaffModuleVisibility();
  const { agendaRead, pautaRead } = useAgendaPautaReadAccess();
  const privileged = Boolean(profile?.active && (profile.role === "owner" || profile.role === "admin"));

  function canSee(href: string): boolean {
    if (href === "/sistema/agenda") return agendaRead || pautaRead;
    if (href.startsWith("/sistema/nfse")) return privileged;
    for (const [prefix, key] of [
      ["/sistema/editorial", "editorial"],
      ["/sistema/clientes", "clientes"],
      ["/sistema/assinaturas", "assinaturas"],
      ["/sistema/financeiro", "financeiro"],
      ["/sistema/publicidade", "publicidade"],
    ] as const) {
      if (href.startsWith(prefix)) return hasModule(key);
    }
    return false;
  }

  const visibleLinks = QUICK_LINKS.filter((item) => canSee(item.href));
  return (
    <>
      <ModuleHeader
        eyebrow="VISÃO GERAL"
        title="Painel interno"
        description="Acesso rápido às áreas do dia a dia da redação."
      />
      <ul className="quick-access-grid">
        {visibleLinks.map((item) => (
          <li key={item.href}>
            <Link className="quick-access-card" href={item.href === "/sistema/agenda"
              ? agendaRead ? "/sistema/agenda?view=agenda" : "/sistema/agenda?view=pauta"
              : item.href}>
              <span className="quick-access-label">{item.label}</span>
              <span className="quick-access-description">{item.description}</span>
              <span className="quick-access-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
