import {
  ArticleService,
  EditorialSectionService,
  ImportCandidateService,
  LocalityService,
  MediaAssetService,
  NewspaperEditionService,
} from "@ir/core";
import {
  createArticleRepositoryMock,
  createEditorialSectionRepositoryMock,
  createImportCandidateRepositoryMock,
  createLocalityRepositoryMock,
  createMediaAssetRepositoryMock,
  createNewspaperEditionRepositoryMock,
  generateMockImportCandidates,
} from "@ir/mocks";
import type { ImportCandidate } from "@ir/types";

// Ponto de composição do Editorial: escolhe o provider (mock) e injeta nos
// serviços. Páginas e Server Actions devem consumir os serviços abaixo,
// nunca os repositórios ou os dados mock diretamente.

const editorialSectionRepository = createEditorialSectionRepositoryMock();
const localityRepository = createLocalityRepositoryMock();
const articleRepository = createArticleRepositoryMock();
const mediaAssetRepository = createMediaAssetRepositoryMock();
const newspaperEditionRepository = createNewspaperEditionRepositoryMock();
const importCandidateRepository = createImportCandidateRepositoryMock();

export const editorialSectionService = new EditorialSectionService(editorialSectionRepository);
export const localityService = new LocalityService(localityRepository);
export const mediaAssetService = new MediaAssetService(mediaAssetRepository);
export const newspaperEditionService = new NewspaperEditionService(newspaperEditionRepository);
export const articleService = new ArticleService(
  articleRepository,
  editorialSectionRepository,
  localityRepository,
);
export const importCandidateService = new ImportCandidateService(
  importCandidateRepository,
  articleService,
);

/**
 * Simula o processamento do PDF selecionado: a escolha de qual gerador mock
 * usar é uma decisão de composição/provider, não de tela nem de Server
 * Action — nenhuma outra camada importa `@ir/mocks` diretamente.
 */
export function generateCandidatesForEdition(editionId: string): Promise<ImportCandidate[]> {
  return importCandidateService.generateMockBatch(generateMockImportCandidates(editionId));
}
