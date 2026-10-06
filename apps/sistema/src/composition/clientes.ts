import type { SupabaseClient } from "@supabase/supabase-js";
import { ClientService } from "@ir/core";
import { createClientRepositorySupabase } from "../providers/supabase/clientRepository.supabase";

// Ponto de composição do módulo Clientes (Fase 1). Fábrica, nunca
// singleton de módulo — precisa da sessão de quem está fazendo a
// requisição (cookies, via createSupabaseServerClient()), que só existe
// DENTRO de uma requisição (mesmo princípio de composition/editorial.ts).
export function getClientService(client: SupabaseClient): ClientService {
  return new ClientService(createClientRepositorySupabase(client));
}
