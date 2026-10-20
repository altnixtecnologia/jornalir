"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

/** Sempre lê versionName / versionCode do APK realmente instalado.
 * Não usa uma constante do site, pois o portal é atualizado sem trocar APK.
 */
export function InstalledAndroidVersion(): JSX.Element | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("App")) return;
    void import("@capacitor/app")
      .then(({ App }) => App.getInfo())
      .then((info) => {
        if (live && info.id === "com.jornalir") {
          setVersion(`${info.version} · build ${info.build}`);
        }
      })
      .catch(() => {
        if (live) setVersion(null);
      });
    return () => { live = false; };
  }, []);
  return version ? (
    <span className="text-[11px] font-semibold text-[color:var(--site-muted)]" aria-label={`Versão do aplicativo: ${version}`}>
      {version}
    </span>
  ) : null;
}
