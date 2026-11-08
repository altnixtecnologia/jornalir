import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { guardNegotiatedValues, type ExistingGuardItem, type GuardItem, type NegotiatedValuesGuardDeps } from "../src/lib/contracts/negotiatedValuesGuard";

const LIST = new Map<string, number | undefined>([["p1", 1000], ["semtabela", undefined]]);

function deps(options: { can?: boolean; existing?: ExistingGuardItem[] } = {}) {
  const calls = { permission: 0 };
  const value: NegotiatedValuesGuardDeps = {
    loadListPrices: async () => LIST,
    loadExistingItems: options.existing ? async () => options.existing as ExistingGuardItem[] : undefined,
    canNegotiate: async () => {
      calls.permission += 1;
      return options.can ?? false;
    },
  };
  return { value, calls };
}

const item = (overrides: Partial<GuardItem> = {}): GuardItem => ({ productId: "p1", description: "Banner", quantity: 2, unitPrice: 1000, discountAmount: 0, ...overrides });

test("valor igual à tabela: liberado e a permissão nem é consultada", async () => {
  const { value, calls } = deps();
  assert.equal(await guardNegotiatedValues([item()], value), null);
  assert.equal(calls.permission, 0);
});

test("acima OU abaixo da tabela (preço ou desconto) sem a permissão: bloqueia", async () => {
  for (const changed of [item({ unitPrice: 1200 }), item({ unitPrice: 800 }), item({ discountAmount: 100 })]) {
    const { value } = deps();
    const error = await guardNegotiatedValues([changed], value);
    assert.match(error ?? "", /Negociar valores/);
  }
});

test("com a permissão: libera valor diferente da tabela", async () => {
  const { value, calls } = deps({ can: true });
  assert.equal(await guardNegotiatedValues([item({ unitPrice: 1500 })], value), null);
  assert.equal(calls.permission, 1);
});

test("item livre (sem produto) e produto sem preço de tabela nunca são bloqueados", async () => {
  const { value } = deps();
  assert.equal(await guardNegotiatedValues([item({ productId: undefined, unitPrice: 77 }), item({ productId: "semtabela", unitPrice: 5 })], value), null);
});

test("edição: valor que a proposta JÁ tinha (negociado antes) continua editável sem a permissão", async () => {
  const existing: ExistingGuardItem[] = [{ productId: "p1", quantity: 2, unitPrice: 1200, discountAmount: 0 }];
  const { value } = deps({ existing });
  // mesmo valor efetivo, outra quantidade e outra descrição
  assert.equal(await guardNegotiatedValues([item({ unitPrice: 1200, quantity: 5, description: "Banner novo" })], value), null);
  // mesmo efetivo via desconto equivalente também é o mesmo valor
  assert.equal(await guardNegotiatedValues([item({ unitPrice: 1300, quantity: 1, discountAmount: 100 })], value), null);
});

test("edição: itens vindos da montagem (tabela gravada) aceitam voltar à tabela; mas um valor NOVO exige a permissão", async () => {
  const existing: ExistingGuardItem[] = [{ productId: "p1", quantity: 1, unitPrice: 900, discountAmount: 0, listUnitPrice: 1000 }];
  const sameAsStored = deps({ existing });
  assert.equal(await guardNegotiatedValues([item({ unitPrice: 900 })], sameAsStored.value), null);
  const brandNew = deps({ existing });
  assert.match((await guardNegotiatedValues([item({ unitPrice: 700 })], brandNew.value)) ?? "", /Negociar valores/);
});

test("edição: outro item novo negociado em proposta existente continua exigindo a permissão", async () => {
  const existing: ExistingGuardItem[] = [{ productId: "p1", quantity: 1, unitPrice: 1000, discountAmount: 0 }];
  const { value } = deps({ existing });
  assert.match((await guardNegotiatedValues([item({ unitPrice: 1000 }), item({ unitPrice: 1 })], value)) ?? "", /Negociar valores/);
});

test("as duas actions do formulário antigo aplicam a guarda; a edição informa os itens existentes", () => {
  const create = readFileSync(new URL("../src/app/sistema/publicidade/propostas/novo/actions.ts", import.meta.url), "utf8");
  const update = readFileSync(new URL("../src/app/sistema/publicidade/propostas/[id]/actions.ts", import.meta.url), "utf8");
  for (const source of [create, update]) {
    assert.match(source, /guardNegotiatedValues\(serviceInput\.items/);
    assert.match(source, /checkModuleAction\("publicidade", "valores_negociar"\)/);
  }
  assert.match(update, /loadExistingItems: async \(\) => \(await getCommercialProposalService\(client\)\.getWithItems\(id\)\)\.items/);
  assert.ok(!/loadExistingItems/.test(create));
});
