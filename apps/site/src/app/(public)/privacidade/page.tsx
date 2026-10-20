import Link from "next/link";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { contactInfo } from "../../../components/site/siteSettings";

export const metadata = {
  title: "Política de Privacidade e LGPD | Informativo Regional",
  description: "Conheça como o Jornal Informativo Regional trata dados pessoais, cookies, notificações e como exercer seus direitos pela LGPD.",
};

const sections = [
  {
    id: "responsavel",
    title: "1. Quem é responsável pelos dados",
    paragraphs: [
      "O Jornal Informativo Regional (Informativo Regional LTDA) é responsável pelos tratamentos de dados pessoais realizados no contexto do portal jornalístico e de seus canais oficiais, conforme a finalidade de cada serviço.",
      "Para assuntos de privacidade e proteção de dados, envie sua solicitação ao e-mail de contato do Jornal IR, com o assunto “Privacidade/LGPD”.",
    ],
  },
  {
    id: "dados",
    title: "2. Que informações podem ser tratadas",
    paragraphs: [
      "Ao entrar em contato conosco, você pode informar nome, e-mail, telefone e o conteúdo de sua mensagem ou sugestão de pauta.",
      "Ao navegar, sistemas de hospedagem e segurança podem registrar dados técnicos necessários à prestação do serviço, como endereço IP, data e hora, navegador, dispositivo e informações sobre erros e requisições.",
      "Se você optar por receber notificações, são tratados identificadores técnicos do navegador ou aplicativo, token de entrega, identificador da instalação, escolhas de categorias e dados necessários para administrar o recebimento dos avisos.",
    ],
  },
  {
    id: "finalidades",
    title: "3. Para que usamos essas informações",
    paragraphs: [
      "Utilizamos as informações para atender leitores, responder mensagens, receber pautas, disponibilizar o conteúdo jornalístico, manter a segurança e a estabilidade do portal e administrar preferências de notificações.",
      "As notificações de notícias normais e urgentes dependem da ativação voluntária do serviço. Você pode alterar suas escolhas e desativar o recebimento pelo aplicativo, navegador ou configurações do dispositivo.",
      "Os tratamentos observam as bases legais aplicáveis a cada finalidade, como consentimento quando exigido, cumprimento de obrigações legais, execução de serviços solicitados e interesses legítimos avaliados conforme a LGPD.",
    ],
  },
  {
    id: "cookies",
    title: "4. Cookies e armazenamento no dispositivo",
    paragraphs: [
      "O portal e o aplicativo podem utilizar cookies, cache, armazenamento local e tecnologias equivalentes para recursos necessários, como preferências, funcionamento da interface, sessão e gerenciamento dos avisos escolhidos.",
      "Esses recursos não significam, por si só, autorização para publicidade personalizada. Caso sejam implementadas ferramentas não essenciais de rastreamento que dependam de consentimento, o Jornal IR deverá apresentar informações e escolhas apropriadas antes de sua ativação.",
      "Você também pode gerenciar ou limpar dados do site pelas configurações do navegador. A limpeza pode remover preferências salvas e exigir nova configuração de algumas funções.",
    ],
  },
  {
    id: "compartilhamento",
    title: "5. Serviços externos e compartilhamento",
    paragraphs: [
      "A operação do portal e do aplicativo envolve prestadores de tecnologia para hospedagem, banco de dados, armazenamento e entrega de notificações, incluindo Vercel, Supabase, Cloudflare R2 e Firebase/Google, conforme os recursos utilizados.",
      "Ao escolher contato por WhatsApp, redes sociais ou links externos, você também estará sujeito às práticas de privacidade desses serviços. Dados podem ser compartilhados quando necessário para operar os serviços ou atender obrigações legais, com medidas de proteção apropriadas.",
      "Alguns provedores podem operar infraestrutura fora do Brasil. Nesses casos, as transferências internacionais de dados devem observar os requisitos legais aplicáveis.",
    ],
  },
  {
    id: "retencao",
    title: "6. Segurança e conservação",
    paragraphs: [
      "Adotamos medidas técnicas e administrativas destinadas a proteger informações pessoais contra acessos indevidos e incidentes de segurança. Nenhum sistema conectado à internet oferece risco zero.",
      "Os dados são mantidos pelo período necessário às finalidades informadas e, quando couber, para cumprimento de obrigações legais ou exercício regular de direitos. A conservação pode variar de acordo com o tipo de dado e serviço utilizado.",
    ],
  },
  {
    id: "direitos",
    title: "7. Seus direitos pela LGPD",
    paragraphs: [
      "Você pode solicitar, conforme a legislação aplicável, confirmação do tratamento, acesso, correção de informações incompletas ou desatualizadas, anonimização, bloqueio ou eliminação nas hipóteses previstas em lei, informações sobre compartilhamento, portabilidade quando aplicável e oposição a tratamentos irregulares.",
      "Quando o tratamento depender de seu consentimento, você poderá revogá-lo. Para exercer seus direitos, entre em contato pelo e-mail indicado nesta página; poderemos solicitar informações suficientes para confirmar sua identidade antes de atender a determinados pedidos.",
      "Você também pode buscar orientação ou apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD), quando cabível.",
    ],
  },
  {
    id: "atualizacoes",
    title: "8. Atualizações desta política",
    paragraphs: [
      "Esta política poderá ser atualizada para refletir alterações nos serviços, tecnologias utilizadas ou exigências legais. A versão atual fica disponível permanentemente no rodapé do portal.",
      "Última atualização: 20 de outubro de 2026.",
    ],
  },
];

export default function PrivacidadePage(): JSX.Element {
  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />
      <article className="site-shell mx-auto max-w-5xl py-8 md:py-12">
        <header className="rounded-2xl border bg-white p-6 md:p-10" style={{ borderColor: "var(--site-line)" }}>
          <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: "var(--brand-red)" }}>Transparência e proteção de dados</p>
          <h1 className="mt-3 font-editorial text-3xl font-bold leading-tight md:text-4xl">
            POLÍTICA DE PRIVACIDADE E LGPD
          </h1>
          <p className="mt-4 text-base leading-relaxed" style={{ color: "var(--site-muted)" }}>
            A privacidade dos leitores faz parte do compromisso do Jornal IR com a confiança e a informação.
            Aqui explicamos, em linguagem acessível, o tratamento de dados no portal e no aplicativo.
          </p>
          <a className="mt-5 inline-flex rounded-lg border px-4 py-2 text-sm font-semibold hover:underline" style={{ borderColor: "var(--site-line)", color: "var(--brand-navy)" }}
             href={`mailto:${contactInfo.email}?subject=Privacidade%20LGPD%20-%20Jornal%20IR`}>
            Falar sobre seus dados
          </a>
        </header>

        <div className="mt-6 space-y-4">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-20 rounded-2xl border bg-white p-6 md:p-8"
                     style={{ borderColor: "var(--site-line)" }}>
              <h2 className="text-xl font-bold md:text-2xl">{section.title}</h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed md:text-base" style={{ color: "var(--site-muted)" }}>
                {section.paragraphs.map((p) => <p key={p}>{p}</p>)}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-6 rounded-2xl border p-6 md:p-8" style={{ borderColor: "var(--site-line)", background: "var(--site-surface)" }}>
          <h2 className="text-xl font-bold">Contato para privacidade e LGPD</h2>
          <p className="mt-3 text-sm leading-relaxed">
            <strong>E-mail:</strong>{" "}
            <a href={`mailto:${contactInfo.email}?subject=Privacidade%20LGPD%20-%20Jornal%20IR`} className="underline">{contactInfo.email}</a>
          </p>
          <p className="mt-2 text-sm"><strong>Endereço:</strong> Rua Joaquim Pereira Maciel, 256, Centro, São João do Sul/SC.</p>
          <p className="mt-4 text-sm"><Link href="/contato" className="font-semibold underline">Outras formas de contato</Link></p>
        </section>
      </article>
    </main>
  );
}
