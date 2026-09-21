import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArticleService,
  EditorialSectionService,
  ImportCandidateService,
  LocalityService,
  MediaAssetService,
  NewspaperEditionService,
} from "@ir/core";
import { createArticleRepositorySupabase } from "../providers/supabase/articleRepository.supabase";
import { createEditorialSectionRepositorySupabase } from "../providers/supabase/editorialSectionRepository.supabase";
import { createImportCandidateRepositorySupabase } from "../providers/supabase/importCandidateRepository.supabase";
import { createLocalityRepositorySupabase } from "../providers/supabase/localityRepository.supabase";
import { createMediaAssetRepositorySupabase } from "../providers/supabase/mediaAssetRepository.supabase";
import { createNewspaperEditionRepositorySupabase } from "../providers/supabase/newspaperEditionRepository.supabase";

// Ponto de composição do Editorial. Fase 24: editorias e localidades
// passaram a usar o provider real do Supabase. Fase 25: matérias e
// destinos editoriais (article_placements) também. Fase 26: mídias
// também. Fase 27: edições do jornal (somente leitura) e importação de
// PDF também — nenhum mock de conteúdo editorial resta em `apps/sistema`
// (ver docs/HANDOFF-CODEX.md).
//
// Todo provider real precisa da sessão de quem está fazendo a requisição
// (cookies, via `createSupabaseServerClient()`), que só existe DENTRO de
// uma requisição — por isso são todos fábricas, nunca singletons de módulo.

export function getMediaAssetService(client: SupabaseClient): MediaAssetService {
  return new MediaAssetService(createMediaAssetRepositorySupabase(client));
}

export function getEditorialSectionService(client: SupabaseClient): EditorialSectionService {
  return new EditorialSectionService(createEditorialSectionRepositorySupabase(client));
}

export function getLocalityService(client: SupabaseClient): LocalityService {
  return new LocalityService(createLocalityRepositorySupabase(client));
}

export function getNewspaperEditionService(client: SupabaseClient): NewspaperEditionService {
  return new NewspaperEditionService(createNewspaperEditionRepositorySupabase(client));
}

export function getArticleService(client: SupabaseClient): ArticleService {
  return new ArticleService(
    createArticleRepositorySupabase(client),
    createEditorialSectionRepositorySupabase(client),
    createLocalityRepositorySupabase(client),
  );
}

export function getImportCandidateService(client: SupabaseClient): ImportCandidateService {
  return new ImportCandidateService(createImportCandidateRepositorySupabase(client), getArticleService(client));
}
