import { ArticleService, EditorialSectionService, LocalityService } from "@ir/core";
import {
  createArticleRepositoryMock,
  createEditorialSectionRepositoryMock,
  createLocalityRepositoryMock,
} from "@ir/mocks";

// Ponto de composição do Editorial: escolhe o provider (mock) e injeta nos
// serviços. Páginas devem consumir os serviços abaixo, nunca os repositórios
// ou os dados mock diretamente.

const editorialSectionRepository = createEditorialSectionRepositoryMock();
const localityRepository = createLocalityRepositoryMock();
const articleRepository = createArticleRepositoryMock();

export const editorialSectionService = new EditorialSectionService(editorialSectionRepository);
export const localityService = new LocalityService(localityRepository);
export const articleService = new ArticleService(
  articleRepository,
  editorialSectionRepository,
  localityRepository,
);
