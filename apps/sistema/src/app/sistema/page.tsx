import Link from "next/link";
import { ModuleHeader } from "../../components/admin/ModuleHeader";

export default function SistemaHomePage(): JSX.Element {
  return (
    <>
      <ModuleHeader
        eyebrow="A CASA DO SEU JORNAL"
        title="O trabalho começa aqui."
        description="Um espaço para cuidar das histórias, das relações e do dia a dia do Informativo Regional."
      />
      <section className="home-feature" aria-labelledby="redacao-title">
        <div>
          <p className="eyebrow">01 / REDAÇÃO</p>
          <h2 id="redacao-title">
            Boas histórias merecem
            <br />
            um bom lugar para começar.
          </h2>
          <p>
            Conheça o espaço editorial e o caminho de uma matéria, da preparação
            à publicação.
          </p>
          <Link className="primary-link" href="/sistema/editorial">
            Abrir Editorial <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="feature-note">
          <span>EM CONSTRUÇÃO</span>
          <p>Uma base para a próxima fase do jornal.</p>
          <small>
            Os módulos serão disponibilizados por etapas, com foco na rotina da
            equipe.
          </small>
        </div>
      </section>
      <div className="home-columns">
        <section aria-labelledby="atalhos-title">
          <div className="section-heading">
            <h2 id="atalhos-title">Acessos disponíveis</h2>
            <span>Operação atual</span>
          </div>
          <Link className="access-row" href="/sistema/anuncios">
            <div>
              <h3>Anúncios</h3>
              <p>Consultar e editar anúncios de demonstração.</p>
            </div>
            <span aria-hidden="true">↗</span>
          </Link>
          <Link className="access-row" href="/sistema/patrocinadores">
            <div>
              <h3>Patrocinadores</h3>
              <p>Consultar e editar cadastros de demonstração.</p>
            </div>
            <span aria-hidden="true">↗</span>
          </Link>
          <p className="helper-text">
            As alterações nesses cadastros são temporárias e se perdem ao
            recarregar ou sair da página.
          </p>
        </section>
        <section className="workspace-note" aria-labelledby="ambiente-title">
          <p className="eyebrow">SOBRE ESTE ESPAÇO</p>
          <h2 id="ambiente-title">Clareza para trabalhar.</h2>
          <p>
            Use o menu para explorar as áreas do jornal. Os módulos sinalizados
            como planejados apresentam o que será desenvolvido.
          </p>
          <p>
            A publicação de matérias e as integrações serão disponibilizadas nas
            próximas etapas.
          </p>
        </section>
      </div>
    </>
  );
}
