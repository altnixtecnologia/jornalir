import "server-only";

import { createSign, randomUUID } from "node:crypto";

const DEFAULT_PUBLIC_FOLDER_ID = "1lhyhSYnD_h2t5fmdQLXJsvQl7iJ90nsV";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size";
const MAX_PDF_BYTES = 100 * 1024 * 1024;

function permissionsUrl(fileId: string): string {
  return `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`;
}

export class DriveArchiveNotConfiguredError extends Error {}
export class InvalidDriveEditionPdfError extends Error {}

type DriveAuthConfig =
  | {
      mode: "oauth";
      folderId: string;
      clientId: string;
      clientSecret: string;
      refreshToken: string;
    }
  | {
      mode: "service-account";
      folderId: string;
      email: string;
      privateKey: string;
    };

function getConfig(): DriveAuthConfig | null {
  const folderId = process.env.DRIVE_PUBLIC_FOLDER_ID?.trim() || DEFAULT_PUBLIC_FOLDER_ID;

  // Preferido para pasta comum do Google Drive: o arquivo é criado pela
  // própria conta do jornal e usa a cota normal dessa conta.
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (clientId && clientSecret && refreshToken) {
    return { mode: "oauth", folderId, clientId, clientSecret, refreshToken };
  }

  // Alternativa para Shared Drive / Google Workspace. Service accounts não
  // devem ser a primeira opção para uma pasta comum de "Meu Drive", porque
  // podem não ter cota própria para criar arquivos.
  const email = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  if (email && rawKey) {
    return {
      mode: "service-account",
      folderId,
      email,
      privateKey: rawKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

export function isEditionDriveArchiveConfigured(): boolean {
  return getConfig() !== null;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

async function getOAuthAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Google Drive: falha ao renovar acesso da conta (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google Drive: token de acesso não retornado.");
  return data.access_token;
}

async function getServiceAccountAccessToken(email: string, privateKey: string): Promise<string> {
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

async function getAccessToken(config: DriveAuthConfig): Promise<string> {
  return config.mode === "oauth"
    ? getOAuthAccessToken(config.clientId, config.clientSecret, config.refreshToken)
    : getServiceAccountAccessToken(config.email, config.privateKey);
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
 */
export async function uploadEditionPdfToDrive(
  file: File,
  options: DriveEditionUploadOptions = {},
): Promise<{ fileId: string; previewUrl: string; viewUrl: string; name: string }> {
  const config = getConfig();
  if (!config) {
    throw new DriveArchiveNotConfiguredError(
      "Arquivo do Jornal Online ainda não configurado. Configure a conexão do Google Drive no painel.",
    );
  }

  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) throw new InvalidDriveEditionPdfError("Envie um arquivo PDF.");
  if (file.size > MAX_PDF_BYTES) {
    throw new InvalidDriveEditionPdfError(
      `PDF muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite atual: 100 MB.`,
    );
  }

  const accessToken = await getAccessToken(config);
  const name = safePdfName(file.name, options.editionNumber, options.publicationDate);
  const boundary = `jornalir-${randomUUID()}`;
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
    body: new Uint8Array(body),
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

  // A API do Drive NUNCA herda o compartilhamento "qualquer pessoa com o
  // link" da pasta para um arquivo criado via files.create — diferente de
  // um upload manual pela interface web do Drive (arrastar-e-soltar), que
  // herda automaticamente. Sem este passo explícito, o PDF fica privado
  // (só a conta que fez o upload enxerga) e o apps/site — que lê a pasta
  // e os arquivos de forma anônima, sem OAuth — não conseguiria exibi-lo.
  await grantPublicReadPermission(data.id, accessToken);

  return {
    fileId: data.id,
    name: data.name ?? name,
    previewUrl: `https://drive.google.com/file/d/${data.id}/preview`,
    viewUrl: `https://drive.google.com/file/d/${data.id}/view`,
  };
}

async function grantPublicReadPermission(fileId: string, accessToken: string): Promise<void> {
  const response = await fetch(permissionsUrl(fileId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google Drive: PDF enviado, mas não foi possível torná-lo público (HTTP ${response.status})${detail ? ` — ${detail.slice(0, 180)}` : ""}.`,
    );
  }
}
