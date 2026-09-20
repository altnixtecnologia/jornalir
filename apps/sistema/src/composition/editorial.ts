import {
  ArticleService,
  EditorialSectionService,
  LocalityService,
  MediaAssetService,
} from "@ir/core";
import {
  createArticleRepositoryMock,
  createEditorialSectionRepositoryMock,
  createLocalityRepositoryMock,
  createMediaAssetRepositoryMock,
} from "@ir/mocks";

// Ponto de composição do Editorial: escolhe o provider (mock) e injeta nos
// serviços. Páginas e Server Actions devem consumir os serviços abaixo,
// nunca os repositórios ou os dados mock diretamente.

const editorialSectionRepository = createEditorialSectionRepositoryMock();
const localityRepository = createLocalityRepositoryMock();
const articleRepository = createArticleRepositoryMock();
const mediaAssetRepository = createMediaAssetRepositoryMock();

export const editorialSectionService = new EditorialSectionService(editorialSectionRepository);
export const localityService = new LocalityService(localityRepository);
export const mediaAssetService = new MediaAssetService(mediaAssetRepository);
export const articleService = new ArticleService(
  articleRepository,
  editorialSectionRepository,
  localityRepository,
);
