import type { ReactNode } from "react";
import { ModuleBackButton } from "./ModuleBackButton";

interface ModuleHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  eyebrowAction?: ReactNode;
  middle?: ReactNode;
}

export function ModuleHeader({
  eyebrow,
  title,
  description,
  action,
  eyebrowAction,
  middle,
}: ModuleHeaderProps): JSX.Element {
  return (
    <header className="module-header">
      <div>
        <div className="module-eyebrow-row"><p className="eyebrow">{eyebrow}</p>{eyebrowAction}<ModuleBackButton /></div>
        <h1>{title}</h1>
        <p className="module-description">{description}</p>
      </div>
      {middle ? <div className="module-header-middle">{middle}</div> : null}
      {action ? <div className="module-action">{action}</div> : null}
    </header>
  );
}
