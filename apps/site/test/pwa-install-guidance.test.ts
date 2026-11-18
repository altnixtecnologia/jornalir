import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const invite = read("../src/components/site/AppInstallInvitation.tsx");
const header = read("../src/components/site/SiteHeader.tsx");
const page = read("../src/app/(public)/instalar/page.tsx");
const manifest = read("../src/app/manifest.ts");
const sw = read("../public/sw.js");

test("PWA do Jornal: convite oferecido no iPhone e Android, sem depender de APK", () => {
  assert.ok(invite.includes('type Device = "ios" | "android" | "desktop"'));
  assert.ok(invite.includes('beforeinstallprompt'));
  assert.ok(invite.includes('prompt.prompt()'));
  assert.ok(invite.includes('display-mode: standalone'));
  assert.ok(invite.includes('navigator as Navigator & { standalone?: boolean }'));
  assert.ok(!invite.includes('getPublishedAndroidRelease'));
  assert.ok(!invite.includes('Baixar aplicativo'));
});

test("iPhone e navegadores do WhatsApp recebem roteiro claro e link para Safari", () => {
  assert.ok(invite.includes('iPad|iPhone|iPod'));
  assert.ok(invite.includes('FBAN|FBAV|Instagram|WhatsApp'));
  assert.ok(invite.includes('Adicionar à Tela de Início'));
  assert.ok(invite.includes('quadrado e uma seta para cima'));
  assert.ok(invite.includes('Abra no Safari'));
  assert.ok(invite.includes('Copiar link para abrir no'));
  assert.ok(invite.includes('navigator.clipboard.writeText'));
  assert.ok(invite.includes('Instalar app'));
});

test("o convite não se repete em toda página e permanece disponível no menu", () => {
  assert.ok(invite.includes('sessionStorage.getItem(SEEN_SESSION)'));
  assert.ok(invite.includes('localStorage.getItem(DISMISSED_AT)'));
  assert.ok(invite.includes('REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000'));
  assert.ok(invite.includes('mode = "automatic"'));
  assert.ok(invite.includes('setVisible(false)'));
  assert.ok(header.includes('href: "/instalar", label: "Instalar o Jornal"'));
  assert.ok(page.includes('<AppInstallInvitation mode="page" />'));
});

test("mantém a estrutura do PWA e não volta a guardar notícias antigas em cache", () => {
  assert.ok(manifest.includes('id: "/"'));
  assert.ok(manifest.includes('start_url: "/"'));
  assert.ok(manifest.includes('display: "standalone"'));
  assert.ok(manifest.includes('/icons/icon-ir-192.png'));
  assert.ok(manifest.includes('/icons/icon-ir-512.png'));
  assert.ok(sw.includes('fetch(request).catch'));
  assert.ok(sw.includes('isNextDataOrRsc'));
});
