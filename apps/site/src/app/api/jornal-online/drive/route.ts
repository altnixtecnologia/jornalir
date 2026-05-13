import { NextResponse } from "next/server";

interface DriveEdition {
  id: string;
  title: string;
  dateLabel: string;
  category: string;
  pdfPath: string;
  sourceUrl: string;
}

const DEFAULT_FOLDER_ID = "1lhyhSYnD_h2t5fmdQLXJsvQl7iJ90nsV";

function parseDriveFolderHtml(html: string): DriveEdition[] {
  const pattern = /id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?flip-entry-title">([^<]+)</g;
  const items: DriveEdition[] = [];
  let match: RegExpExecArray | null = pattern.exec(html);

  while (match) {
    const fileId = match[1];
    const rawTitle = match[2]?.trim() ?? "Edição";
    const cleanTitle = rawTitle.replace(/\.pdf$/i, "");
    items.push({
      id: `drive-${fileId}`,
      title: `Informativo Regional - ${cleanTitle}`,
      dateLabel: "Acervo Drive",
      category: "Edição Semanal",
      pdfPath: `https://drive.google.com/file/d/${fileId}/preview`,
      sourceUrl: `https://drive.google.com/file/d/${fileId}/view`,
    });
    match = pattern.exec(html);
  }

  return items.sort((a, b) => b.title.localeCompare(a.title, "pt-BR", { numeric: true }));
}

export async function GET(): Promise<NextResponse> {
  try {
    const folderId = process.env.DRIVE_PUBLIC_FOLDER_ID || DEFAULT_FOLDER_ID;
    const url = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      return NextResponse.json({ ok: false, items: [], error: "Falha ao ler pasta do Drive." }, { status: 502 });
    }

    const html = await response.text();
    const items = parseDriveFolderHtml(html);
    return NextResponse.json({ ok: true, items });
  } catch {
    return NextResponse.json({ ok: false, items: [], error: "Erro interno ao carregar edições." }, { status: 500 });
  }
}
