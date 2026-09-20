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
} from "@ir/mocks";

// Ponto de composição do Editorial: escolhe o provider (mock) e injeta nos
// serviços. Páginas e Server Actions devem consumir os serviços abaixo,
// nunca os repositórios ou os dados mock diretamente. A extração real de
// PDF (Fase 09) fica em ./pdfCandidateExtraction — o único outro lugar
// autorizado a produzir `NewImportCandidateRecord[]` para o
// `importCandidateService` abaixo.

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
