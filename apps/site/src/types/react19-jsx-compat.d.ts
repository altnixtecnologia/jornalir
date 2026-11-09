import type { JSX as ReactJSX } from "react";

/** Compatibilidade temporária de tipos JSX.Element ao migrar para React 19. */
declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
  }
}
export {};
