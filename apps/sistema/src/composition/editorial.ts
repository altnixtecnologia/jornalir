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
  createImportCandidateRepositoryMock,
  createMediaAssetRepositoryMock,
  createNewspaperEditionRepositoryMock,
} from "@ir/mocks";
import { createArticleRepositorySupabase } from "../providers/supabase/articleRepository.supabase";
import { createEditorialSectionRepositorySupabase } from "../providers/supabase/editorialSectionRepository.supabase";
import { createLocalityRepositorySupabase } from "../providers/supabase/localityRepository.supabase";

// Ponto de composição do Editorial. Fase 24: editorias e localidades
// passaram a usar o provider real do Supabase. Fase 25: matérias e
// destinos editoriais (article_placements) também — mídias e importação
// de PDF (o candidato em si) continuam mock (ver docs/HANDOFF-CODEX.md).
//
// Todo provider real precisa da sessão de quem está fazendo a requisição
// (cookies, via `createSupabaseServerClient()`), que só existe DENTRO de
// uma requisição — por isso viraram fábricas em vez de singletons de
// módulo. `mediaAssetRepository`/`importCandidateRepository` continuam
// únicos por processo (mock em memória) — só o serviço em volta é
// reconstruído a cada chamada, os dados continuam os mesmos.

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
    createArticleRepositorySupabase(client),
    createEditorialSectionRepositorySupabase(client),
    createLocalityRepositorySupabase(client),
  );
}

export function getImportCandidateService(client: SupabaseClient): ImportCandidateService {
  return new ImportCandidateService(importCandidateRepository, getArticleService(client));
}
