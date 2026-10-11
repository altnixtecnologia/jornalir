import type { SupabaseClient } from "@supabase/supabase-js";
import { SiteAdSettingsService, SiteAdSlotService } from "@ir/core";
import { createSiteAdSettingsRepositorySupabase, createSiteAdSlotRepositorySupabase } from "../providers/supabase/siteAdRepository.supabase";

// Ponto de composição de Patrocinadores do site — fábrica, nunca
// singleton de módulo (mesmo princípio dos demais composition/*.ts).
export function getSiteAdSettingsService(client: SupabaseClient): SiteAdSettingsService {
  return new SiteAdSettingsService(createSiteAdSettingsRepositorySupabase(client));
}

export function getSiteAdSlotService(client: SupabaseClient): SiteAdSlotService {
  return new SiteAdSlotService(createSiteAdSlotRepositorySupabase(client));
}
