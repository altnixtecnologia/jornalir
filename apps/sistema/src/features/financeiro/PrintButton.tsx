"use client";

export function PrintButton(): JSX.Element {
  return (
    <button type="button" onClick={() => window.print()}>
      Imprimir / salvar como PDF
    </button>
  );
}
