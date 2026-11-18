import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manager = readFileSync(resolve(process.cwd(), "apps/sistema/src/features/usuarios/UsersManager.tsx"), "utf8");
const css = readFileSync(resolve(process.cwd(), "apps/sistema/src/app/globals.css"), "utf8");

test("cadastro de usuários abre em modal sem formulário permanente na página", () => {
  assert.match(manager, /\+ Novo usuário/);
  assert.match(manager, /onClick=\{openInviteDialog\}/);
  assert.match(manager, /inviteDialogRef\.current\?\.showModal\(\)/);
  assert.match(manager, /aria-labelledby="usuarios-invite-title"/);
  assert.match(manager, /<h2 id="usuarios-invite-title">Cadastrar novo usuário<\/h2>/);
  assert.match(manager, /inviteUser\(inviteEmail\.trim\(\), sentName, inviteRole\)/);
  assert.match(manager, /<option value="operator">Operador<\/option>/);
  assert.match(manager, /canPromoteToAdmin\(\) \? <option value="admin">Administrador<\/option>/);
  assert.match(manager, /inviteDialogRef\.current\?\.close\(\)/);
  assert.doesNotMatch(manager, /<p className="field-label">Convidar usuário<\/p>/);
});

test("cada usuário continua na tabela com cinco colunas, ações e versão móvel", () => {
  assert.match(manager, /<th>Nome<\/th>[\s\S]*<th>Papel<\/th>[\s\S]*<th>Status<\/th>[\s\S]*<th>Criado em<\/th>[\s\S]*<th>Ações<\/th>/);
  assert.match(manager, /<div className="usuarios-name-inline">/);
  assert.match(manager, /<div className="usuarios-row-actions">/);
  assert.match(manager, /<ul className="materias-cards">/);
  assert.match(css, /\.usuarios-toolbar\{[\s\S]*?flex-wrap:nowrap/);
  assert.match(css, /\.usuarios-table \.usuarios-row-actions\{\s*display:flex;flex-wrap:nowrap;/);
  assert.match(css, /\.usuarios-table \.usuarios-row-actions \.usuarios-action-button span\{\s*display:none/);
});
