export function SiteFooter(): JSX.Element {
  return (
    <footer className="mt-10 border-t border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/70">
      <div className="site-shell flex w-full flex-col gap-2 px-4 py-6 text-center text-sm text-zinc-600 dark:text-zinc-300 md:flex-row md:items-center md:justify-between md:text-left">
        <p>© {new Date().getFullYear()} Informativo Regional. Todos os direitos reservados.</p>
        <p className="text-zinc-500 dark:text-zinc-400">
          Desenvolvido por{" "}
          <a
            href="https://altnix.com.br"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
          >
            Altnix Tecnologia
          </a>
        </p>
      </div>
    </footer>
  );
}

