"use server";

import {
  loadCaptureDraftsForEdition,
  removeLastCaptureArea,
  saveCaptureRegionState,
  saveNewCaptureDraft,
  type SaveCaptureStateInput,
  type SaveNewCaptureDraftInput,
} from "../../lib/editorial/visualCaptureDraft";

/**
 * Server Actions finas chamadas pelo modal de captura visual
 * (`PdfVisualCaptureModal.tsx`) — a lógica real vive em
 * `lib/editorial/visualCaptureDraft.ts` (testável com deps injetadas).
 */

export async function saveNewCaptureDraftAction(input: SaveNewCaptureDraftInput) {
  return saveNewCaptureDraft(input);
}

export async function saveCaptureRegionStateAction(input: SaveCaptureStateInput) {
  return saveCaptureRegionState(input);
}

export async function loadCaptureDraftsForEditionAction(editionId: string) {
  return loadCaptureDraftsForEdition(editionId);
}

export async function removeLastCaptureAreaAction(articleId: string) {
  return removeLastCaptureArea(articleId);
}
