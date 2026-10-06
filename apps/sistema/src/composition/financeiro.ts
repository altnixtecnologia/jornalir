import type { SupabaseClient } from "@supabase/supabase-js";
import { ClientCreditService, ContractService, ReceivableService } from "@ir/core";
import { createReceivableRepositorySupabase } from "../providers/supabase/receivableRepository.supabase";
import { createContractRepositorySupabase } from "../providers/supabase/contractRepository.supabase";
import { createClientCreditRepositorySupabase } from "../providers/supabase/clientCreditRepository.supabase";

// Ponto de composição do módulo Financeiro — fábrica, nunca singleton de
// módulo (mesmo princípio de composition/assinaturas.ts e composition/clientes.ts).
export function getReceivableService(client: SupabaseClient): ReceivableService {
  return new ReceivableService(createReceivableRepositorySupabase(client), createClientCreditRepositorySupabase(client));
}

export function getContractService(client: SupabaseClient): ContractService {
  return new ContractService(createContractRepositorySupabase(client));
}

export function getClientCreditService(client: SupabaseClient): ClientCreditService {
  return new ClientCreditService(createClientCreditRepositorySupabase(client));
}
