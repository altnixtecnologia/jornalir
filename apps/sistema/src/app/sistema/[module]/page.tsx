import Link from "next/link";
import { notFound } from "next/navigation";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { EmptyModuleState } from "../../../components/admin/EmptyModuleState";
import { adminModules } from "../../../lib/navigation";

export function generateStaticParams(): Array<{ module: string }> {
  return adminModules
    .filter((item) => item.planned)
    .map((item) => ({ module: item.slug }));
}

export default function PlannedModulePage({
  params,
}: {
  params: { module: string };
}): JSX.Element {
  const module = adminModules.find(
    (item) => item.slug === params.module && item.planned,
  );
  if (!module) notFound();
  return (
    <>
      <ModuleHeader
        eyebrow="ÁREA DE TRABALHO"
        title={module.label}
        description={module.description}
      />
      <EmptyModuleState
        title="Um próximo capítulo."
        description={`O módulo ${module.label} será desenvolvido em uma próxima etapa.`}
      />
      {module.slug === "publicidade" ? (
        <section className="legacy-access">
          <h2>Cadastros existentes</h2>
          <p>
            Os cadastros de demonstração continuam disponíveis. As alterações
            são temporárias.
          </p>
          <div>
            <Link className="secondary-link" href="/sistema/anuncios">
              Abrir anúncios ↗
            </Link>
            <Link className="secondary-link" href="/sistema/patrocinadores">
              Abrir patrocinadores ↗
            </Link>
          </div>
        </section>
      ) : null}
    </>
  );
}
