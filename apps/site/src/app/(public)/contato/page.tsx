"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { contactInfo } from "../../../components/site/siteSettings";

export default function ContatoPage(): JSX.Element {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const composedMessage = useMemo(() => {
    return [
      "Olá, equipe do Informativo Regional!",
      "",
      `Nome: ${name || "-"}`,
      `E-mail: ${email || "-"}`,
      `Telefone: ${phone || "-"}`,
      "",
      "Mensagem:",
      message || "-"
    ].join("\n");
  }, [name, email, phone, message]);

  const whatsappHref = `https://wa.me/${contactInfo.phoneRaw}?text=${encodeURIComponent(composedMessage)}`;
  const mailtoHref = `mailto:${contactInfo.email}?subject=${encodeURIComponent("Contato pelo site - Informativo Regional")}&body=${encodeURIComponent(composedMessage)}`;
  const addressLabel = "Rua Joaquim Pereira Maciel, 256 - Centro, São João do Sul - SC - Brasil";
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLabel)}`;
  const wazeHref = `https://waze.com/ul?q=${encodeURIComponent(addressLabel)}&navigate=yes`;

  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />
      <section className="site-shell py-8">
        <div className="rounded-3xl border p-7 text-white shadow-2xl" style={{ borderColor: "var(--site-line)", background: "var(--brand-navy)" }}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Fale com a redação</p>
          <h1 className="mt-2 font-editorial text-5xl leading-tight">Contato</h1>
          <p className="mt-3 max-w-3xl text-sm text-white/90">
            Envie pauta, anúncio, sugestão ou mensagem para nossa equipe. Estamos sempre prontos para ouvir a comunidade e responder com atenção.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={whatsappHref} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
              Enviar por WhatsApp
            </Link>
            <Link href={mailtoHref} className="rounded-lg border border-white/40 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
              Enviar por E-mail
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <aside className="rounded-2xl border p-6" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
            <h2 className="font-editorial text-3xl">Privacidade e LGPD</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--site-muted)" }}>
              Respeitamos a Lei Geral de Proteção de Dados (LGPD). Os dados informados neste contato são usados apenas para retorno da sua solicitação.
            </p>
            <ul className="mt-4 space-y-2 text-sm" style={{ color: "var(--site-muted)" }}>
              <li>Não compartilhamos seus dados com terceiros sem necessidade legal.</li>
              <li>Você pode solicitar atualização ou exclusão dos dados a qualquer momento.</li>
              <li>As mensagens são tratadas com finalidade de atendimento editorial e comercial.</li>
            </ul>
            <div className="mt-5 space-y-2 rounded-xl p-4 text-sm" style={{ background: "var(--site-bg)" }}>
              <p><span className="font-semibold">Telefone/WhatsApp:</span> {contactInfo.phoneLabel}</p>
              <p><span className="font-semibold">E-mail:</span> {contactInfo.email}</p>
              <p><span className="font-semibold">Endereço:</span> {addressLabel}</p>
              <div className="mt-3 hidden sm:block">
                <Link
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-[color:var(--site-surface)]"
                  style={{ borderColor: "var(--site-line)", color: "var(--site-text)" }}
                >
                  Ver no mapa
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
                <Link
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex justify-center rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-[color:var(--site-surface)]"
                  style={{ borderColor: "var(--site-line)", color: "var(--site-text)" }}
                >
                  Abrir no Google Maps
                </Link>
                <Link
                  href={wazeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex justify-center rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-[color:var(--site-surface)]"
                  style={{ borderColor: "var(--site-line)", color: "var(--site-text)" }}
                >
                  Abrir no Waze
                </Link>
              </div>
            </div>
          </aside>

          <div className="rounded-2xl border p-6" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
            <h2 className="font-editorial text-3xl">Dados para Contato</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--site-muted)" }}>Preencha seus dados e escolha o canal para enviar.</p>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--site-muted)" }}>Nome completo</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                  style={{ borderColor: "var(--site-line)", background: "var(--site-bg)" }}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--site-muted)" }}>Telefone</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Telefone"
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                  style={{ borderColor: "var(--site-line)", background: "var(--site-bg)" }}
                />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--site-muted)" }}>E-mail</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-mail"
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                  style={{ borderColor: "var(--site-line)", background: "var(--site-bg)" }}
                />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--site-muted)" }}>Sua mensagem</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Sua mensagem"
                  rows={7}
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                  style={{ borderColor: "var(--site-line)", background: "var(--site-bg)" }}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: "var(--brand-navy)" }}
              >
                Mandar no WhatsApp
              </Link>
              <Link href={mailtoHref} className="rounded-lg border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--site-line)" }}>
                Mandar no E-mail
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
