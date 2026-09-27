import "server-only";

import { createSign } from "node:crypto";

const DEFAULT_PUBLIC_FOLDER_ID = "1lhyhSYnD_h2t5fmdQLXJsvQl7iJ90nsV";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size";
const MAX_PDF_BYTES = 100 * 1024 * 1024;

export class DriveArchiveNotConfiguredError extends Error {}
export class InvalidDriveEditionPdfError extends Error {}

function getConfig(): { email: string; privateKey: string; folderId: string } | null {
  const email = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  if (!email || !rawKey) return null;

  return {
    email,
    privateKey: rawKey.replace(/\\n/g, "\n"),
    folderId: process.env.DRIVE_PUBLIC_FOLDER_ID?.trim() || DEFAULT_PUBLIC_FOLDER_ID,
  };
}

export function isEditionDriveArchiveConfigured(): boolean {
  return getConfig() !== null;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

async function getAccessToken(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: email,
      scope: DRIVE_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 60 * 60,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Google Drive: falha ao autenticar o serviço (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google Drive: token de acesso não retornado.");
  return data.access_token;
}

function safePdfName(fileName: string, editionNumber?: number, publicationDate?: string): string {
  const source = editionNumber
    ? `Informativo Regional - Edicao ${editionNumber}${publicationDate ? ` - ${publicationDate}` : ""}`
    : fileName.replace(/\.pdf$/i, "");
  const clean = source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _.-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${clean || "Informativo Regional"}.pdf`;
}

export interface DriveEditionUploadOptions {
  editionNumber?: number;
  publicationDate?: string;
}

/**
 * Arquivo oficial do Jornal Online.
 * O PDF vai para a mesma pasta pública do Google Drive já consumida por
 * apps/site, e o Supabase guarda apenas metadados/URL — não os bytes.
 *
 * Para funcionar, compartilhe a pasta DRIVE_PUBLIC_FOLDER_ID como Editor
 * com GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL.
 */
export async function uploadEditionPdfToDrive(
  file: File,
  options: DriveEditionUploadOptions = {},
): Promise<{ fileId: string; previewUrl: string; viewUrl: string; name: string }> {
  const config = getConfig();
  if (!config) {
    throw new DriveArchiveNotConfiguredError(
      "Arquivo do Jornal Online ainda não configurado. Defina GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL e GOOGLE_DRIVE_PRIVATE_KEY no painel.",
    );
  }

  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) throw new InvalidDriveEditionPdfError("Envie um arquivo PDF.");
  if (file.size > MAX_PDF_BYTES) {
    throw new InvalidDriveEditionPdfError(
      `PDF muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite atual: 100 MB.`,
    );
  }

  const accessToken = await getAccessToken(config.email, config.privateKey);
  const name = safePdfName(file.name, options.editionNumber, options.publicationDate);
  const boundary = `jornalir-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name,
    mimeType: "application/pdf",
    parents: [config.folderId],
  });
  const fileBytes = Buffer.from(await file.arrayBuffer());

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      "utf8",
    ),
    Buffer.from(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`, "utf8"),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);

  const response = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google Drive: não foi possível arquivar o PDF (HTTP ${response.status})${detail ? ` — ${detail.slice(0, 180)}` : ""}.`,
    );
  }

  const data = (await response.json()) as { id?: string; name?: string };
  if (!data.id) throw new Error("Google Drive: upload concluído sem ID do arquivo.");

  return {
    fileId: data.id,
    name: data.name ?? name,
    previewUrl: `https://drive.google.com/file/d/${data.id}/preview`,
    viewUrl: `https://drive.google.com/file/d/${data.id}/view`,
  };
}
