import Link from "next/link";

const steps = [
  {
    title: "Preparar",
    description:
      "Título, texto, editoria e localidade. Imagens e subtítulo quando fizerem sentido.",
  },
  {
    title: "Revisar",
    description:
      "Conferir o conteúdo, organizar a galeria e definir a posição editorial.",
  },
  {
    title: "Publicar",
    description:
      "Salvar como rascunho, publicar agora ou escolher a data e o horário.",
  },
];

export function EditorialOverview(): JSX.Element {
  return (
    <>
      <div className="editorial-notice">
        <span className="status-label">Listagem disponível</span>
        <p>
          A listagem de matérias já consulta o domínio editorial. O cadastro e
          a edição completos chegam em uma próxima etapa.
        </p>
        <Link className="text-link" href="/sistema/editorial/materias">
          Ver matérias <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <section aria-labelledby="fluxo-title">
        <div className="section-heading">
          <h2 id="fluxo-title">Da ideia à notícia</h2>
          <span>O fluxo editorial</span>
        </div>
        <ol className="editorial-steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="step-number">0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="editorial-scope" aria-labelledby="organizacao-title">
        <div>
          <p className="eyebrow">ORGANIZAÇÃO DA REDAÇÃO</p>
          <h2 id="organizacao-title">Cada conteúdo no seu lugar.</h2>
          <p>
            A editoria define o assunto. A localidade aproxima a notícia do
            leitor. O destaque dá visibilidade por um período.
          </p>
        </div>
        <dl className="scope-list">
          <div>
            <dt>Matérias e programação</dt>
            <dd>Rascunhos, revisão e calendário de publicação.</dd>
          </div>
          <div>
            <dt>Editorias e localidades</dt>
            <dd>Assuntos, cidades e regiões independentes.</dd>
          </div>
          <div>
            <dt>Mídias e edição digital</dt>
            <dd>Capa, galeria e vínculo com o jornal impresso.</dd>
          </div>
        </dl>
      </section>
      <p className="editorial-rule">
        A decisão de publicar é sempre da redação. Conteúdo importado do jornal
        deverá passar por revisão e entrar como rascunho.
      </p>
    </>
  );
}
