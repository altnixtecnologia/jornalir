import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

interface NavbarProps {
  title: string;
  links: Array<{ href: string; label: string }>;
}

export function Navbar({ title, links }: NavbarProps): JSX.Element {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-serif text-xl font-bold tracking-tight">
          {title}
        </Link>
        <nav className="hidden gap-4 text-sm md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
