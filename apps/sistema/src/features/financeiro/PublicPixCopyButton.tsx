"use client";

import { useState } from "react";

export function PublicPixCopyButton({ payload }: { payload: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const element = document.createElement("textarea");
      element.value = payload;
      element.style.position = "fixed";
      element.style.opacity = "0";
      document.body.appendChild(element);
      element.select();
      document.execCommand("copy");
      element.remove();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      style={{
        width: "100%",
        border: 0,
        borderRadius: 8,
        padding: "12px 16px",
        background: "#252456",
        color: "#fff",
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {copied ? "Pix copiado ✓" : "Copiar Pix"}
    </button>
  );
}
