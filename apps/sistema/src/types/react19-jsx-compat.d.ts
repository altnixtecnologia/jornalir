import type { JSX as ReactJSX } from "react";

/**
 * Compatibilidade transitória dos retornos JSX.Element existentes durante
 * a migração da aplicação Next 14/React 18 para Next 15/React 19.
 * O tipo continua sendo o JSX real do React. Não muda runtime.
 * Remover quando todos os retornos usarem React.JSX.Element.
 */
declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
  }
}
export {};
