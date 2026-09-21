import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { GenerateCandidatesForm } from "../../../../features/editorial/GenerateCandidatesForm";
import { ImportCandidateList } from "../../../../features/editorial/ImportCandidateList";
import { ImportFlowSteps, type ImportFlowStep } from "../../../../features/editorial/ImportFlowSteps";
import {
  editorialSectionService,
  importCandidateService,
  localityService,
  newspaperEditionService,
} from "../../../../composition/editorial";

export default async function ImportarPdfPage({
  searchParams,
}: {
  searchParams: { edicao?: string };
}): Promise<JSX.Element> {
  const editionId = searchParams.edicao ?? "";
  const [editions, sections, localities] = await Promise.all([
    newspaperEditionService.list(),
    editorialSectionService.list(),
    localityService.list(),
  ]);
  const candidates = editionId
    ? await importCandidateService.list({ editionId })
    : [];
  const selectedEdition = editions.find((edition) => edition.id === editionId);
  const hasActiveCandidates = candidates.length > 0;
  const currentStep: ImportFlowStep = !selectedEdition ? "edicao" : hasActiveCandidates ? "candidatos" : "pdf";

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / IMPORTAÇÃO"
        title="Importar do jornal impresso"
        description="Selecione uma edição, envie o PDF real e revise os candidatos extraídos antes de virarem rascunhos."
      />

      <ImportFlowSteps current={currentStep} />

      <section className="form-section import-step" aria-labelledby="edicao-title">
        <h2 id="edicao-title">1. Selecionar edição</h2>
        <form method="get" className="edition-picker">
          <label className="form-field">
            <span className="field-label">Edição do jornal</span>
            <select name="edicao" defaultValue={editionId}>
              <option value="">Selecione uma edição</option>
              {editions.map((edition) => (
                <option key={edition.id} value={edition.id}>
                  {edition.title} · {edition.reference}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="header-action">
            Selecionar edição
          </button>
        </form>
      </section>

      {selectedEdition ? (
        <>
          <section className="form-section import-step" aria-labelledby="pdf-title">
            <h2 id="pdf-title">2. Enviar o PDF da edição</h2>
            {hasActiveCandidates ? (
              <details className="generate-more">
                <summary>Gerar novo lote de candidatos para esta edição</summary>
                <GenerateCandidatesForm editionId={selectedEdition.id} />
              </details>
            ) : (
              <GenerateCandidatesForm editionId={selectedEdition.id} />
            )}
          </section>

          <section className="form-section import-step" aria-labelledby="candidatos-title">
            <h2 id="candidatos-title">3. Revisar candidatos</h2>
            {hasActiveCandidates ? (
              <ImportCandidateList
                candidates={candidates}
                sections={sections}
                localities={localities}
              />
            ) : (
              <p className="helper-text">
                Nenhum candidato ainda para esta edição. Simule a seleção do PDF acima
                para gerar o lote.
              </p>
            )}
          </section>
        </>
      ) : (
        <p className="helper-text">Selecione uma edição para continuar.</p>
      )}

      <p className="editorial-rule">
        Nada é publicado automaticamente. Todo candidato aprovado entra como rascunho;
        publicidade ou conteúdo indesejado pode ser descartado a qualquer momento.
      </p>
    </>
  );
}
