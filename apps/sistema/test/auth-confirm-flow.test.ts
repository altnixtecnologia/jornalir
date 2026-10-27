import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAuthConfirmType,
  authConfirmSuccessDestination,
  authConfirmErrorDestination,
  INVALID_LINK_DESTINATION,
} from "../src/lib/auth/authConfirmFlow";

test("só invite e recovery são tipos válidos; qualquer outro valor é rejeitado", () => {
  assert.equal(parseAuthConfirmType("invite"), "invite");
  assert.equal(parseAuthConfirmType("recovery"), "recovery");
  for (const invalid of ["signup", "magiclink", "email_change", "email", "", null,
    "invite ", "INVITE", "../definir-senha", "https://evil.invalid"]) {
    assert.equal(parseAuthConfirmType(invalid), null, `"${invalid}" não deveria ser aceito`);
  }
});

test("convite confirmado leva a /definir-senha sem recovery=1", () => {
  assert.equal(authConfirmSuccessDestination("invite"), "/definir-senha");
});

test("recuperação confirmada leva a /definir-senha?recovery=1", () => {
  assert.equal(authConfirmSuccessDestination("recovery"), "/definir-senha?recovery=1");
});

test("link de convite expirado/usado volta para /definir-senha com aviso, preservando o tipo", () => {
  assert.equal(authConfirmErrorDestination("invite"), "/definir-senha?erro=link-expirado");
});

test("link de recuperação expirado/usado preserva recovery=1 e o aviso", () => {
  assert.equal(authConfirmErrorDestination("recovery"), "/definir-senha?recovery=1&erro=link-expirado");
});

test("nenhum destino desta rota aponta para fora do próprio domínio (sem open redirect)", () => {
  const destinations = [
    INVALID_LINK_DESTINATION,
    authConfirmSuccessDestination("invite"),
    authConfirmSuccessDestination("recovery"),
    authConfirmErrorDestination("invite"),
    authConfirmErrorDestination("recovery"),
  ];
  for (const destination of destinations) {
    assert.ok(destination.startsWith("/"), `${destination} precisa ser um caminho relativo interno`);
    assert.ok(!destination.startsWith("//"), `${destination} não pode ser um redirecionamento disfarçado de protocolo-relativo`);
  }
});
