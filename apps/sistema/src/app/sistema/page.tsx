import Link from "next/link";
import { ModuleHeader } from "../../components/admin/ModuleHeader";

const QUICK_LINKS = [
  { label: "Matérias", href: "/sistema/editorial/materias", description: "Ver, filtrar e abrir tudo o que já foi cadastrado." },
  { label: "Nova matéria", href: "/sistema/editorial/materias/nova", description: "Cadastrar uma matéria manualmente." },
  { label: "Importar PDF", href: "/sistema/editorial/importar-pdf", description: "Extrair candidatos a matéria do jornal impresso." },
  { label: "Mídias", href: "/sistema/editorial/midias", description: "Buscar, cadastrar e revisar imagens da biblioteca." },
  { label: "Editorias", href: "/sistema/editorial/editorias", description: "Gerenciar os assuntos do jornal." },
  { label: "Localidades", href: "/sistema/editorial/localidades", description: "Gerenciar cidades e regiões." },
];

export default function SistemaHomePage(): JSX.Element {
  return (
    <>
      <ModuleHeader
        eyebrow="VISÃO GERAL"
        title="Painel interno"
        description="Acesso rápido às áreas do dia a dia da redação."
      />
      <ul className="quick-access-grid">
        {QUICK_LINKS.map((item) => (
          <li key={item.href}>
            <Link className="quick-access-card" href={item.href}>
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
