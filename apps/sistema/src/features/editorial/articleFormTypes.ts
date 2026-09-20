import type {
  ArticleMedia,
  EditorialPlacementType,
  EditorialTextStyle,
  NotificationMode,
} from "@ir/types";

export type ArticleFormIntent = "draft" | "publish" | "schedule";

export interface ArticleFormPayload {
  title: string;
  titleStyle: EditorialTextStyle;
  subtitle: string;
  subtitleStyle: EditorialTextStyle;
  body: string;
  sectionId: string;
  localityId: string;
  notificationMode: NotificationMode;
  placementType: EditorialPlacementType;
  placementStartsAt: string;
  placementEndsAt: string;
  scheduledAt: string;
  media: ArticleMedia[];
}

/** Validação compartilhada entre o formulário (feedback imediato) e a Server Action (defesa em profundidade). */
export function validateArticlePayload(
  payload: ArticleFormPayload,
  intent: ArticleFormIntent,
): string | null {
  if (!payload.title.trim()) return "Informe o título.";
  if (!payload.body.trim()) return "Informe o corpo da matéria.";
  if (!payload.sectionId) return "Selecione a editoria.";
  if (!payload.localityId) return "Selecione a localidade.";
  if (intent === "schedule" && !payload.scheduledAt) {
    return "Informe a data e a hora da programação.";
  }
  return null;
}
