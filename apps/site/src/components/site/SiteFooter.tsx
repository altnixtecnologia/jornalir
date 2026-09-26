import Link from "next/link";
import { socialLinks, contactInfo } from "./siteSettings";
import { listPublicSections } from "../../lib/public/publicContentService";

/** Até 8 editorias cabem em duas colunas de até 4 linhas cada, sem aumentar a altura do rodapé (Fase 29, item 7). */
function splitInHalf<T>(list: T[]): [T[], T[]] {
  const mid = Math.ceil(list.length / 2);
  return [list.slice(0, mid), list.slice(mid)];
}

// Editorias do rodapé vêm do banco real (Fase 30, item 4) — nunca mais de
// um mock fixo. Uma editoria inativa some daqui automaticamente (a view
// `public_editorial_sections` já só traz `active=true`), mas continua
// existindo/vinculada a matérias antigas.
export async function SiteFooter(): Promise<JSX.Element> {
  const sections = await listPublicSections().catch(() => []);
  const [editoriaColumnA, editoriaColumnB] = splitInHalf(sections);

  return (
    <footer className="site-footer">
      <div className="site-shell grid grid-cols-2 gap-x-6 gap-y-6 py-8 md:grid-cols-5">
        <div className="col-span-2 md:col-span-1">
          <img src="/brand/logo-ir.png" alt="Informativo Regional" style={{ height: 28, width: "auto", display: "block" }} />
          <p className="mt-3 max-w-[200px] text-sm text-[color:var(--site-muted)]">O jornal da sua região — cobertura da costa sul de Santa Catarina e litoral norte do Rio Grande do Sul.</p>
        </div>

        <div>
          <p className="footer-heading">Editorias</p>
          {editoriaColumnA.map((section) => (
            <Link key={section.id} href={`/editoria/${section.slug}`} className="footer-link">
              {section.name}
            </Link>
          ))}
        </div>

        <div>
          <p className="footer-heading">&nbsp;</p>
          {editoriaColumnB.map((section) => (
            <Link key={section.id} href={`/editoria/${section.slug}`} className="footer-link">
              {section.name}
            </Link>
          ))}
        </div>

        <div>
          <p className="footer-heading">Institucional</p>
          <Link href="/jornal-online" className="footer-link">Jornal Online</Link>
          <Link href="/sobre" className="footer-link">Sobre</Link>
          <Link href="/contato" className="footer-link">Contato</Link>
          <Link href="/busca" className="footer-link">Buscar</Link>
        </div>

        <div>
          <p className="footer-heading">Contato</p>
          <a href={`mailto:${contactInfo.email}`} className="footer-link">{contactInfo.email}</a>
          <a href={socialLinks.whatsapp} target="_blank" rel="noreferrer" className="footer-link">{contactInfo.phoneLabel}</a>
          <div className="mt-2 flex gap-2">
            {[
              { href: socialLinks.facebook, icon: "/brand/social-facebook.png", label: "Facebook" },
              { href: socialLinks.instagram, icon: "/brand/social-instagram.png", label: "Instagram" },
              { href: socialLinks.whatsapp, icon: "/brand/social-whatsapp.png", label: "WhatsApp" }
            ].map((social) => (
              <a key={social.label} href={social.href} target="_blank" rel="noreferrer" aria-label={social.label} className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full ring-1 ring-[color:var(--site-line)]">
                <img src={social.icon} alt="" className="h-7 w-7 object-cover" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-[color:var(--site-line)]">
        <div className="site-shell flex flex-col gap-1 py-3 text-xs text-[color:var(--site-muted)] md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Informativo Regional. Todos os direitos reservados.</p>
          <p>
            Desenvolvido por{" "}
            <a href="https://altnix.com.br" target="_blank" rel="noreferrer" className="font-semibold text-[color:var(--site-text)] hover:text-[color:var(--brand-red)]">
              Altnix Tecnologia
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
