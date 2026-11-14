import type { NfseTomadorSnapshot } from "@ir/types";

/**
 * Os campos exibidos como somente leitura continuam adulteráveis por HTTP.
 * O servidor nunca aceita dados fiscais de tomador inventados pela tela.
 * Na edição, preserva o snapshot histórico ou usa o cadastro mestre atual.
 */
const FIELDS = [
  "kind", "name", "cpf", "cnpj", "municipalRegistration", "stateRegistration",
  "zip", "street", "number", "complement", "neighborhood", "city", "state",
  "ibgeCode", "email", "phone",
] as const satisfies readonly (keyof NfseTomadorSnapshot)[];

type Fields = Partial<Omit<NfseTomadorSnapshot, "sourceClientId">>;

function sameFields(a: Fields, b: Fields): boolean {
  return FIELDS.every((field) => (a[field] ?? "") === (b[field] ?? ""));
}

export function resolveUpdateTomadorSnapshot(input: {
  previousClientId: string;
  selectedClientId: string;
  previous: NfseTomadorSnapshot;
  submitted: NfseTomadorSnapshot;
  master: NfseTomadorSnapshot;
}): NfseTomadorSnapshot {
  if (!input.selectedClientId || input.master.sourceClientId !== input.selectedClientId) {
    throw new Error("Cadastro do tomador não corresponde ao cliente selecionado.");
  }
  if (input.previousClientId !== input.selectedClientId) {
    // Troca de cliente: nunca usar o snapshot que veio do navegador.
    return { ...input.master };
  }
  if (input.previous.sourceClientId !== input.previousClientId) {
    throw new Error("Snapshot anterior não corresponde ao cliente do rascunho.");
  }
  if (sameFields(input.submitted, input.previous)) return { ...input.previous };
  if (sameFields(input.submitted, input.master)) return { ...input.master };
  throw new Error("Dados do tomador divergentes do cadastro. Atualize o cliente e recarregue os dados.");
}
