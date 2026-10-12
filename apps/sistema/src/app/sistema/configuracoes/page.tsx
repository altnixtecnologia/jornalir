import Link from "next/link";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";

export default function ConfiguracoesPage(): JSX.Element {
  return (
    <>
      <ModuleHeader eyebrow="CONFIGURAÇÕES" title="Configurações" description="Preferências e organização do ambiente de trabalho." />
      <section className="form-section form-section--first">
        <h2>Áreas</h2>
        <div className="form-grid">
          <Link className="materia-title-link" href="/sistema/usuarios">Usuários</Link>
          <Link className="materia-title-link" href="/sistema/configuracoes/patrocinadores">Patrocinadores do site</Link>
          <Link className="materia-title-link" href="/sistema/configuracoes/valores-assine">Valores da página Assine</Link>
        </div>
      </section>
    </>
  );
}
