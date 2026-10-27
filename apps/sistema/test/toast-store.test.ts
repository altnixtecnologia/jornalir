import test from "node:test";
import assert from "node:assert/strict";
import { pushToast, dismissToast, getVisibleToasts, resetToastStoreForTests } from "../src/lib/feedback/toastStore";

test.beforeEach(() => resetToastStoreForTests());

test("sucesso fecha automaticamente (5s); erro e aviso nunca fecham por tempo", () => {
  pushToast("success", "Permissões atualizadas", "As permissões de Silas foram salvas e já estão valendo.");
  pushToast("error", "Não foi possível salvar a matéria", "As alterações não foram gravadas.");
  pushToast("warning", "Atenção", "Existe saldo mais antigo em aberto.");
  const [success, error, warning] = getVisibleToasts();
  assert.equal(success.durationMs, 5000);
  assert.equal(error.durationMs, null);
  assert.equal(warning.durationMs, null);
});

test("não registra a mesma notificação duas vezes numa janela curta (clique duplo, re-render)", () => {
  const first = pushToast("success", "Convite solicitado", "O Supabase aceitou a solicitação de envio para Silas.");
  const second = pushToast("success", "Convite solicitado", "O Supabase aceitou a solicitação de envio para Silas.");
  assert.notEqual(first, null);
  assert.equal(second, null, "a duplicata não deveria criar um novo toast");
  assert.equal(getVisibleToasts().length, 1);
});

test("mesmo título com descrição ou tipo diferente não é tratado como duplicata", () => {
  pushToast("success", "Convite solicitado", "Para Silas.");
  pushToast("success", "Convite solicitado", "Para Ana.");
  pushToast("error", "Convite solicitado", "Para Silas.");
  assert.equal(getVisibleToasts().length, 3);
});

test("disparar um sucesso nunca fecha um erro já visível (nem vice-versa)", () => {
  pushToast("error", "Não foi possível salvar a matéria", "Tente novamente.");
  pushToast("success", "Matéria salva", "A matéria foi publicada.");
  const kinds = getVisibleToasts().map((toast) => toast.kind);
  assert.deepEqual(kinds, ["error", "success"]);
});

test("limite visual: a partir do 5º toast simultâneo, os excedentes ficam em fila", () => {
  for (let index = 0; index < 6; index += 1) {
    pushToast("warning", "Aviso " + index, "Descrição " + index);
  }
  assert.equal(getVisibleToasts().length, 4, "só 4 ficam visíveis ao mesmo tempo");
});

test("fechar um toast visível promove o próximo da fila automaticamente", () => {
  const ids = [];
  for (let index = 0; index < 6; index += 1) {
    ids.push(pushToast("warning", "Aviso " + index, "Descrição " + index));
  }
  const firstVisibleId = getVisibleToasts()[0].id;
  dismissToast(firstVisibleId);
  const visible = getVisibleToasts();
  assert.equal(visible.length, 4, "a fila repõe o lugar de quem fechou");
  assert.ok(!visible.some((toast) => toast.id === firstVisibleId));
  assert.ok(visible.some((toast) => toast.title === "Aviso 4"), "o 5º (antes em fila) deveria ter entrado");
});

test("fechar um toast que ainda está na fila não promove nada indevido", () => {
  const ids = [];
  for (let index = 0; index < 6; index += 1) {
    ids.push(pushToast("warning", "Aviso " + index, "Descrição " + index));
  }
  const queuedId = ids[5] as string;
  dismissToast(queuedId);
  const visible = getVisibleToasts();
  assert.equal(visible.length, 4);
  assert.ok(!visible.some((toast) => toast.title === "Aviso 5"));
});

test("fechar um id desconhecido não lança erro nem altera a lista visível", () => {
  pushToast("success", "Ok", "Tudo certo.");
  assert.doesNotThrow(() => dismissToast("toast-inexistente"));
  assert.equal(getVisibleToasts().length, 1);
});
