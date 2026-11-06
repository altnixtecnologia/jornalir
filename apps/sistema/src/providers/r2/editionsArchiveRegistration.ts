/**
 * Regras puras do cadastro do acervo histórico (PDFs já no R2 em
 * `acervo/edicoes/IR NNN.pdf`) como fichas em `newspaper_editions`. Usadas
 * por scripts/import-editions-archive.ts; sem I/O, para poderem ser testadas.
 */

export interface ArchiveDateRecord {
  editionNumber: number;
  dateIso: string | null;
  statusFinal: string;
}

export interface ArchiveRegistrationItem {
  editionNumber: number;
  pdfKey: string;
  pdfSize: number;
  dateIso: string;
  coverKey: string;
}

export type ArchiveSkipReason = "ja_cadastrada" | "sem_data" | "sem_capa_local" | "pdf_ausente_no_r2";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** CSV simples com aspas duplas (formato gerado pelos scripts de datas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

export function parseArchiveDatesCsv(text: string): Map<number, ArchiveDateRecord> {
  const [header, ...rows] = parseCsv(text);
  const col = (name: string): number => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Coluna "${name}" não encontrada no relatório de datas.`);
    return index;
  };
  const numberCol = col("edition_number");
  const dateCol = col("date_iso");
  const statusCol = col("status_final");
  const records = new Map<number, ArchiveDateRecord>();
  for (const row of rows) {
    const editionNumber = Number(row[numberCol]);
    if (!Number.isInteger(editionNumber) || editionNumber <= 0) continue;
    records.set(editionNumber, {
      editionNumber,
      dateIso: isValidIsoDate(row[dateCol]) ? row[dateCol] : null,
      statusFinal: row[statusCol] ?? "",
    });
  }
  return records;
}

/** Datas que não vieram confirmadas pela capa entram, mas são listadas para conferência no painel. */
export function needsDateReview(record: ArchiveDateRecord): boolean {
  return record.statusFinal !== "confirmada";
}

/** Disponível às 07:00 America/Sao_Paulo (UTC-3) do dia da edição. */
export function archiveAvailableAtIso(dateIso: string): string {
  return `${dateIso}T10:00:00.000Z`;
}

export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Um único comando (executado de forma atômica): confere que o executor é
 * exatamente 1 perfil ativo, cria as fichas — já publicadas, sem notificação
 * (notification_status='skipped') e fora da fila de matérias (materias_status
 * nulo) — e grava a auditoria só das fichas realmente criadas.
 * `on conflict (edition_number) do nothing`: edição já existente (ex.: 776)
 * nunca é sobrescrita e rodar de novo nunca duplica.
 */
export function buildArchiveRegistrationSql(items: ArchiveRegistrationItem[], actorName: string, generatedAt: Date): string {
  if (items.length === 0) throw new Error("Nenhuma edição para cadastrar.");
  const actor = sqlLiteral(actorName);
  const values = items
    .map((item) => {
      if (!isValidIsoDate(item.dateIso)) throw new Error(`Data inválida na edição ${item.editionNumber}.`);
      if (!Number.isInteger(item.editionNumber) || !Number.isInteger(item.pdfSize)) {
        throw new Error(`Número/tamanho inválido na edição ${item.editionNumber}.`);
      }
      const fileName = item.pdfKey.split("/").pop() ?? `IR ${item.editionNumber}.pdf`;
      return `  (${item.editionNumber}, date ${sqlLiteral(item.dateIso)}, ${sqlLiteral(`Edição ${item.editionNumber}`)}, ${sqlLiteral(item.pdfKey)}, ${sqlLiteral(fileName)}, ${item.pdfSize}::bigint, ${sqlLiteral(item.coverKey)}, timestamptz ${sqlLiteral(archiveAvailableAtIso(item.dateIso))})`;
    })
    .join(",\n");

  return `-- Cadastro do acervo histórico do Jornal Online (${items.length} edições), gerado em ${generatedAt.toISOString()}.
-- Os PDFs já estão no R2 e não são movidos. Executar com: supabase db query --linked -f <este arquivo>
do $check$
begin
  if (select count(*) from public.profiles where active and lower(name) = lower(${actor})) <> 1 then
    raise exception 'Executor não corresponde a exatamente 1 perfil ativo: %', ${actor};
  end if;
end
$check$;

with actor as (
  select id from public.profiles where active and lower(name) = lower(${actor})
),
input (edition_number, publication_date, title, pdf_r2_key, pdf_file_name, pdf_file_size, cover_r2_key, available_at) as (
  values
${values}
),
ins as (
  insert into public.newspaper_editions (
    edition_number, publication_date, title, archive_provider, pdf_r2_key, pdf_file_name, pdf_file_size,
    cover_r2_key, active, online_status, available_at, notification_status, materias_status,
    archived_at, uploaded_by, uploaded_at
  )
  select i.edition_number, i.publication_date, i.title, 'r2', i.pdf_r2_key, i.pdf_file_name, i.pdf_file_size,
         i.cover_r2_key, true, 'available', i.available_at, 'skipped', null,
         now(), (select id from actor), now()
  from input i
  on conflict (edition_number) do nothing
  returning id, edition_number, publication_date, pdf_r2_key
),
aud as (
  insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
  select (select id from actor), 'newspaper_editions', ins.id, 'edition_archive_registered',
         jsonb_build_object(
           'editionNumber', ins.edition_number,
           'publicationDate', ins.publication_date,
           'pdfKey', ins.pdf_r2_key,
           'origin', 'script:import-editions-archive',
           'description', 'Edição histórica cadastrada a partir do acervo R2 por ' || ${actor} || '.'
         )
  from ins
  returning 1
)
select (select count(*) from ins) as cadastradas, (select count(*) from aud) as auditadas;
`;
}
