import Link from "next/link";
import { menuItems } from "./menuConfig";
import { socialLinks, contactInfo } from "./siteSettings";

const EDITORIA_LINKS = menuItems.filter((item) => !["/", "/materias", "/sobre", "/contato", "/jornal-online"].includes(item.href));

export function SiteFooter(): JSX.Element {
  return (
    <footer className="site-footer">
      <div className="site-shell grid grid-cols-2 gap-8 py-12 md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <img src="/brand/logo-ir.png" alt="Informativo Regional" style={{ height: 30, width: "auto", display: "block" }} />
          <p className="mt-4 max-w-[220px] text-sm text-[color:var(--site-muted)]">O jornal da sua região — cobertura da costa sul de Santa Catarina e litoral norte do Rio Grande do Sul.</p>
        </div>

        <div>
          <p className="footer-heading">Editorias</p>
          {EDITORIA_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="footer-link">
              {item.label}
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
          <div className="mt-3 flex gap-2">
            {[
              { href: socialLinks.facebook, icon: "/brand/social-facebook.png", label: "Facebook" },
              { href: socialLinks.instagram, icon: "/brand/social-instagram.png", label: "Instagram" },
              { href: socialLinks.whatsapp, icon: "/brand/social-whatsapp.png", label: "WhatsApp" }
            ].map((social) => (
              <a key={social.label} href={social.href} target="_blank" rel="noreferrer" aria-label={social.label} className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-1 ring-[color:var(--site-line)]">
                <img src={social.icon} alt="" className="h-8 w-8 object-cover" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-[color:var(--site-line)]">
        <div className="site-shell flex flex-col gap-2 py-5 text-xs text-[color:var(--site-muted)] md:flex-row md:items-center md:justify-between">
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
