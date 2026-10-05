import type { SupabaseClient } from "@supabase/supabase-js";
import { SubscriptionService } from "@ir/core";
import { createSubscriptionRepositorySupabase } from "../providers/supabase/subscriptionRepository.supabase";

// Ponto de composição do módulo Assinaturas — fábrica, nunca singleton de
// módulo (mesmo princípio de composition/clientes.ts e composition/editorial.ts).
export function getSubscriptionService(client: SupabaseClient): SubscriptionService {
  return new SubscriptionService(createSubscriptionRepositorySupabase(client));
}
