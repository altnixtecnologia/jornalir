"use client";

import { useEffect, useState } from "react";

type Kind = "commercial" | "institutional";
export type SignaturePdfPreview = {
  url: string | null;
  sha256: string;
  loading: boolean;
  error: string | null;
};

/**
 * Carrega a versão EXATA que a pessoa visualiza em um Blob local.
 * O SHA-256 desses mesmos bytes acompanha o aceite. Se outro signatário
 * alterar a versão entre leitura e confirmação, o servidor a recusa.
 */
export function useVerifiedSignaturePdf(token: string, kind: Kind, emailVerified: boolean): SignaturePdfPreview {
  const [state, setState] = useState<SignaturePdfPreview>({
    url: null, sha256: "", loading: false, error: null,
  });

  useEffect(() => {
    if (!emailVerified) {
      setState({ url: null, sha256: "", loading: false, error: null });
      return;
    }
    const abort = new AbortController();
    let disposed = false;
    let blobUrl: string | null = null;
    setState({ url: null, sha256: "", loading: true, error: null });
    async function run(): Promise<void> {
      const prefix = kind === "commercial" ? "/api/assinar-contrato-comercial/" : "/api/assinar-contrato/";
      const response = await fetch(prefix + token + "/documento", {
        credentials: "same-origin", cache: "no-store", signal: abort.signal,
      });
      if (!response.ok) throw new Error("Não foi possível abrir a versão atual do documento para assinatura.");
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0,5)) !== "%PDF-") {
        throw new Error("O arquivo recebido não é um PDF válido.");
      }
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const sha256 = Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2, "0")).join("");
      if (disposed) return;
      blobUrl = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
      setState({ url: blobUrl, sha256, loading: false, error: null });
    }
    void run().catch((error) => {
      if (!disposed && !abort.signal.aborted) {
        setState({ url: null, sha256: "", loading: false,
          error: error instanceof Error ? error.message : "Falha ao abrir documento." });
      }
    });
    return () => {
      disposed = true;
      abort.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [token, kind, emailVerified]);

  return state;
}
