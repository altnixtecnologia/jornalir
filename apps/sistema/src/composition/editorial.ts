import type { SupabaseClient } from "@supabase/supabase-js";
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
  createImportCandidateRepositoryMock,
  createMediaAssetRepositoryMock,
  createNewspaperEditionRepositoryMock,
} from "@ir/mocks";
import { createEditorialSectionRepositorySupabase } from "../providers/supabase/editorialSectionRepository.supabase";
import { createLocalityRepositorySupabase } from "../providers/supabase/localityRepository.supabase";

// Ponto de composição do Editorial (Fase 24): editorias e localidades
// passaram a usar o provider real do Supabase — matérias, mídias,
// importação de PDF e edições continuam mock (ver docs/HANDOFF-CODEX.md).
//
// Editorial sections/localities precisam da sessão real de quem está
// fazendo a requisição (cookies, via `createSupabaseServerClient()`), que
// só existe DENTRO de uma requisição — por isso não são mais singletons de
// módulo como antes. `getEditorialSectionService`/`getLocalityService` (e,
// por depender deles, `getArticleService`/`getImportCandidateService`)
// viraram fábricas: cada Server Component/Action chama a fábrica com o
// client da própria requisição. `articleRepository`/`importCandidateRepository`
// continuam únicos por processo (mock em memória) — só o serviço em volta é
// reconstruído a cada chamada, os dados continuam os mesmos.

const articleRepository = createArticleRepositoryMock();
const mediaAssetRepository = createMediaAssetRepositoryMock();
const newspaperEditionRepository = createNewspaperEditionRepositoryMock();
const importCandidateRepository = createImportCandidateRepositoryMock();

export const mediaAssetService = new MediaAssetService(mediaAssetRepository);
export const newspaperEditionService = new NewspaperEditionService(newspaperEditionRepository);

export function getEditorialSectionService(client: SupabaseClient): EditorialSectionService {
  return new EditorialSectionService(createEditorialSectionRepositorySupabase(client));
}

export function getLocalityService(client: SupabaseClient): LocalityService {
  return new LocalityService(createLocalityRepositorySupabase(client));
}

export function getArticleService(client: SupabaseClient): ArticleService {
  return new ArticleService(
    articleRepository,
    createEditorialSectionRepositorySupabase(client),
    createLocalityRepositorySupabase(client),
  );
}

export function getImportCandidateService(client: SupabaseClient): ImportCandidateService {
  return new ImportCandidateService(importCandidateRepository, getArticleService(client));
}
