export type ImportFlowStep = "edicao" | "pdf" | "candidatos" | "revisao" | "materia";

const STEPS: { key: ImportFlowStep; label: string }[] = [
  { key: "edicao", label: "Edição" },
  { key: "pdf", label: "PDF" },
  { key: "candidatos", label: "Candidatos" },
  { key: "revisao", label: "Revisão" },
  { key: "materia", label: "Matéria" },
];

/**
 * Trilha visual do fluxo de importação — puramente informativa (nunca
 * navega sozinha): deixa claro em que ponto do caminho
 * "Edição → PDF → Candidatos → Revisão → Matéria" a tela atual está.
 */
export function ImportFlowSteps({ current }: { current: ImportFlowStep }): JSX.Element {
  const currentIndex = STEPS.findIndex((step) => step.key === current);
  return (
    <ol className="import-flow-steps" aria-label="Etapas da importação">
      {STEPS.map((step, index) => (
        <li
          key={step.key}
          className={`import-flow-step${index === currentIndex ? " is-current" : ""}${index < currentIndex ? " is-done" : ""}`}
        >
          <span className="import-flow-step-index" aria-hidden="true">
            {index + 1}
          </span>
          <span className="import-flow-step-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
