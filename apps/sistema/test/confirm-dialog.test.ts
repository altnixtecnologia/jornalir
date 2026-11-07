import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  confirmDialog,
  getCurrentConfirm,
  resetConfirmStoreForTests,
  settleConfirm,
} from "../src/lib/feedback/confirmStore";

test("confirmDialog: resolve true/false conforme a escolha e atende uma confirmação por vez", async () => {
  resetConfirmStoreForTests();
  const first = confirmDialog({ title: "Remover A?" });
  const second = confirmDialog({ title: "Remover B?" });
  assert.equal(getCurrentConfirm()?.title, "Remover A?");
  settleConfirm(getCurrentConfirm()!.id, true);
  assert.equal(await first, true);
  assert.equal(getCurrentConfirm()?.title, "Remover B?", "a segunda espera a primeira fechar");
  settleConfirm(getCurrentConfirm()!.id, false);
  assert.equal(await second, false);
  assert.equal(getCurrentConfirm(), null);
});

test("nenhuma tela do sistema usa a caixa genérica do navegador (window.confirm)", () => {
  const root = fileURLToPath(new URL("../src", import.meta.url));
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|jsx?)$/.test(name)) {
        const source = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
        if (/window\.confirm\s*\(/.test(source)) offenders.push(path);
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], "use confirmDialog() de lib/feedback/confirmStore");
});
