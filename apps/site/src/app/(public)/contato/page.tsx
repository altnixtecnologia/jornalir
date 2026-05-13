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
    <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      <SiteHeader />
      <section className="site-shell py-8">
        <div className="rounded-3xl border border-zinc-300 bg-gradient-to-br from-cyan-700 via-blue-700 to-slate-900 p-7 text-white shadow-2xl dark:border-zinc-700">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Fale com a redação</p>
          <h1 className="mt-2 font-editorial text-5xl leading-tight">Contato</h1>
          <p className="mt-3 max-w-3xl text-sm text-cyan-50/95">
            Envie pauta, anúncio, sugestão ou mensagem para nossa equipe. Estamos sempre prontos para ouvir a comunidade e responder com atenção.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={whatsappHref} target="_blank" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
              Enviar por WhatsApp
            </Link>
            <Link href={mailtoHref} className="rounded-lg border border-white/40 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
              Enviar por E-mail
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <aside className="rounded-2xl border border-zinc-300 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="font-editorial text-3xl">Privacidade e LGPD</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Respeitamos a Lei Geral de Proteção de Dados (LGPD). Os dados informados neste contato são usados apenas para retorno da sua solicitação.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
              <li>Não compartilhamos seus dados com terceiros sem necessidade legal.</li>
              <li>Você pode solicitar atualização ou exclusão dos dados a qualquer momento.</li>
              <li>As mensagens são tratadas com finalidade de atendimento editorial e comercial.</li>
            </ul>
            <div className="mt-5 space-y-2 rounded-xl bg-zinc-100 p-4 text-sm dark:bg-zinc-800/60">
              <p><span className="font-semibold">Telefone/WhatsApp:</span> {contactInfo.phoneLabel}</p>
              <p><span className="font-semibold">E-mail:</span> {contactInfo.email}</p>
              <p><span className="font-semibold">Endereço:</span> {addressLabel}</p>
              <div className="mt-3 hidden sm:block">
                <Link href={mapsHref} target="_blank" className="inline-flex rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200/70 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700/50">
                  Ver no mapa
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
                <Link href={mapsHref} target="_blank" className="inline-flex justify-center rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200/70 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700/50">
                  Abrir no Google Maps
                </Link>
                <Link href={wazeHref} target="_blank" className="inline-flex justify-center rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200/70 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700/50">
                  Abrir no Waze
                </Link>
              </div>
            </div>
          </aside>

          <div className="rounded-2xl border border-zinc-300 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="font-editorial text-3xl">Dados para Contato</h2>
            <p className="mt-2 text-sm text-zinc-500">Preencha seus dados e escolha o canal para enviar.</p>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" className="rounded-lg border border-zinc-300 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone" className="rounded-lg border border-zinc-300 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="rounded-lg border border-zinc-300 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-950 md:col-span-2" />
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Sua mensagem" rows={7} className="rounded-lg border border-zinc-300 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-950 md:col-span-2" />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={whatsappHref} target="_blank" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                Mandar no WhatsApp
              </Link>
              <Link href={mailtoHref} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-700">
                Mandar no E-mail
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
