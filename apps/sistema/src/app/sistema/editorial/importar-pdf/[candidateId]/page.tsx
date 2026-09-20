import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportCandidateNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ImportCandidateReview } from "../../../../../features/editorial/ImportCandidateReview";
import {
  editorialSectionService,
  importCandidateService,
  localityService,
  mediaAssetService,
  newspaperEditionService,
} from "../../../../../composition/editorial";

export default async function ImportCandidateDetailPage({
  params,
}: {
  params: { candidateId: string };
}): Promise<JSX.Element> {
  const candidate = await importCandidateService
    .getById(params.candidateId)
    .catch((error: unknown) => {
      if (error instanceof ImportCandidateNotFoundError) return null;
      throw error;
    });
  if (!candidate) notFound();

  const [sections, localities, mediaAssets, editions] = await Promise.all([
    editorialSectionService.list(),
    localityService.list(),
    mediaAssetService.list(),
    newspaperEditionService.list(),
  ]);
  const edition = editions.find((item) => item.id === candidate.editionId);

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
      <ImportCandidateReview
        candidate={candidate}
        editionTitle={edition?.title ?? "Edição não encontrada"}
        sections={sections}
        localities={localities}
        mediaAssets={mediaAssets}
      />
    </>
  );
}
