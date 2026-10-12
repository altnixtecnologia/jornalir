"use client";

import { usePathname, useRouter } from "next/navigation";

export function MobileBackButton(): JSX.Element | null {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/") return null;

  function goBack(): void {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  return (
    <button type="button" className="mobile-global-back lg:hidden" onClick={goBack} aria-label="Voltar">
      <span aria-hidden="true">←</span>
    </button>
  );
}
