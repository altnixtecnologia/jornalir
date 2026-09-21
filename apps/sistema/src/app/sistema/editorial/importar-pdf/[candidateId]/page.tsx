import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportCandidateNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ImportCandidateReview } from "../../../../../features/editorial/ImportCandidateReview";
import { ImportFlowSteps, type ImportFlowStep } from "../../../../../features/editorial/ImportFlowSteps";
import {
  getEditorialSectionService,
  getImportCandidateService,
  getLocalityService,
  getMediaAssetService,
  getNewspaperEditionService,
} from "../../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export default async function ImportCandidateDetailPage({
  params,
}: {
  params: { candidateId: string };
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const candidate = await getImportCandidateService(supabase)
    .getById(params.candidateId)
    .catch((error: unknown) => {
      if (error instanceof ImportCandidateNotFoundError) return null;
      throw error;
    });
  if (!candidate) notFound();

  const [sections, localities, mediaAssets, editions] = await Promise.all([
    getEditorialSectionService(supabase).list(),
    getLocalityService(supabase).list(),
    getMediaAssetService(supabase).list(),
    getNewspaperEditionService(supabase).list(),
  ]);
  const edition = editions.find((item) => item.id === candidate.editionId);
  const currentStep: ImportFlowStep = candidate.status === "converted" ? "materia" : "revisao";

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / IMPORTAÇÃO"
        title={candidate.suggestedTitle ?? "Candidato sem título"}
        description={`${edition?.title ?? "Edição não encontrada"}${candidate.pageNumber ? ` · página ${candidate.pageNumber}` : ""}`}
        action={
          <Link
            className="secondary-link"
            href={`/sistema/editorial/importar-pdf?edicao=${candidate.editionId}`}
          >
            Voltar aos candidatos
          </Link>
        }
      />
      <ImportFlowSteps current={currentStep} />
      <ImportCandidateReview
        candidate={candidate}
        editionTitle={edition?.title ?? "Edição não encontrada"}
        edition={edition}
        sections={sections}
        localities={localities}
        mediaAssets={mediaAssets}
      />
    </>
  );
}
