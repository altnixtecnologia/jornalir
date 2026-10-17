"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import {
  birthdayWithinEdition, currentBirthdayWeekISO, editionDays, validBirthDate,
} from "../../../features/aniversariantes/birthdayWeek";
import type {
  EditorialBirthdayInput, EditorialBirthdayMessage,
} from "../../../features/aniversariantes/editorialBirthdayTypes";
import {
  extractSafeEditorialPhrase, formatEditorialDayLabel, generateBirthdayMessage,
} from "../../../features/aniversariantes/messageGenerator";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerUploadedMediaAsset } from "../../../providers/supabase/mediaAssetRepository.supabase";
import { InvalidImageUploadError, uploadOptimizedImageToR2 } from "../../../providers/r2/mediaStorage.r2";

const PATH = "/sistema/aniversariantes";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type ActionResult<T = undefined> = { ok: true; data: T } | { error: string };
async function permitted(): Promise<{ db: SupabaseClient; userId: string } | null> {
  const db = createSupabaseServerClient();
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) return null;
  const { data: profile } = await db.from("profiles").select("role,active")
    .eq("id", auth.user.id).maybeSingle();
  if (!profile?.active) return null;
  if (profile.role === "operator") {
    const { data, error: denied } = await db.rpc("staff_can_see_module", { p_module: "aniversariantes" });
    if (denied || data !== true) return null;
  } else if (profile.role !== "owner" && profile.role !== "admin") return null;
  return { db, userId: auth.user.id };
}
function clean(value: string, length: number): string {
  return value.trim().slice(0, length);
}

/**
 * Resolve o "aniversário" do cadastro mestre — nascimento para pessoa física,
 * fundação para instituição (PJ). Nunca confunde os dois campos: cada kind só
 * lê a sua própria data. Usado por setBirthdayPublication/
 * prepareBirthdayEditionMessage (source "cliente") para tratar os dois casos
 * com o mesmo fluxo, sem duplicar a lógica de vínculo editorial.
 */
function resolveMasterAnniversary(master: {
  kind: string; full_name: string | null; company_name: string | null; trade_name: string | null;
  birth_date: string | null; founding_date: string | null;
}): { name: string; date: string } | null {
  if (master.kind === "individual") {
    if (!master.birth_date || !validBirthDate(master.birth_date)) return null;
    return { name: master.full_name || "Pessoa sem nome", date: master.birth_date };
  }
  if (master.kind === "company") {
    if (!master.founding_date || !validBirthDate(master.founding_date)) return null;
    return { name: master.trade_name || master.company_name || "Empresa sem nome", date: master.founding_date };
  }
  return null;
}

export async function saveEditorialBirthday(input: EditorialBirthdayInput): Promise<ActionResult<{ id: string }>> {
  const caller = await permitted();
  if (!caller) return { error: "Acesso não autorizado ao módulo Aniversariantes." };
  const name = clean(input.displayName, 180);
  if (!name || !validBirthDate(input.birthDate) || input.displayName.length > 180) {
    return { error: "Informe nome e uma data de nascimento válida." };
  }
  if (input.groupClientId && !UUID.test(input.groupClientId)) return { error: "Grupo de cliente inválido." };
  if (input.id && !UUID.test(input.id)) return { error: "Identificador de aniversariante inválido." };
  const { db, userId } = caller;
  let origin: "manual" | "familiar" = "manual";
  if (input.groupClientId) {
    const { data: client } = await db.from("clients").select("id,kind,status")
      .eq("id", input.groupClientId).maybeSingle();
    if (!client || client.status !== "active") return { error: "Cliente vinculado não encontrado." };
    origin = client.kind === "individual" ? "familiar" : "manual";
  }
  const [year, month, day] = input.birthDate.split("-").map(Number);
  const fields = {
    group_client_id: input.groupClientId || null,
    source_client_id: null,
    origin,
    display_name: name,
    birth_year: year, birth_month: month, birth_day: day,
    city: clean(input.city, 120) || null,
    relationship: clean(input.relationship, 100) || null,
    profession: clean(input.profession, 150) || null,
    organization: clean(input.organization, 180) || null,
    known_as: clean(input.knownAs, 120) || null,
    message_context: clean(input.messageContext, 1500) || null,
    notes: clean(input.notes, 1500) || null,
    publish_in_print: Boolean(input.publishInPrint),
    ...(input.id && typeof input.active==="boolean" ? { active:input.active }:{}),
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    // Never edit a client-derived birthday in this editor: the master client owns its identity and date.
    const { data: updated, error } = await db.from("birthday_entries").update(fields)
      .eq("id", input.id).is("source_client_id", null)
      .select("id").maybeSingle();
    if (error || !updated) return { error: "Não foi possível atualizar. Confira o registro e suas permissões." };
    revalidatePath(PATH);
    return { ok: true, data: { id: updated.id } };
  }
  const { data: created, error } = await db.from("birthday_entries")
    .insert({ ...fields, active: true, created_by: userId }).select("id").single();
  if (error || !created) return { error: "Não foi possível salvar este aniversariante." };
  revalidatePath(PATH);
  return { ok: true, data: { id: created.id } };
}

export async function setEditorialBirthdayActive(id: string, active: boolean): Promise<ActionResult> {
  const caller = await permitted();
  if (!caller) return { error: "Acesso não autorizado." };
  if (!UUID.test(id)) return { error: "Identificador inválido." };
  const { data, error } = await caller.db.from("birthday_entries")
    .update({ active: Boolean(active), updated_at: new Date().toISOString() })
    .eq("id", id).is("source_client_id", null).select("id").maybeSingle();
  if (error || !data) return { error: "Não foi possível alterar o registro editorial." };
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

/** Autoriza ou retira a publicação sem alterar a data no cadastro mestre.
 * A data de nascimento, sozinha, nunca concede autorização editorial.
 */
export async function setBirthdayPublication(
  source: "cliente" | "editorial", id: string, allowed: boolean,
): Promise<ActionResult<{ published: boolean }>> {
  const caller = await permitted();
  if (!caller) return { error: "Acesso não autorizado ao módulo Aniversariantes." };
  if (!UUID.test(id) || (source !== "cliente" && source !== "editorial") || typeof allowed !== "boolean") {
    return { error: "Dados de publicação inválidos." };
  }
  const { db, userId } = caller;

  if (source === "editorial") {
    const { data: saved, error } = await db.from("birthday_entries")
      .update({ publish_in_print: allowed, updated_at: new Date().toISOString() })
      .eq("id",id).is("source_client_id",null).eq("active",true)
      .select("id,publish_in_print").maybeSingle();
    if (error || !saved) return { error: "Não foi possível alterar a publicação deste aniversariante." };
    revalidatePath(PATH);
    return { ok: true, data: { published: saved.publish_in_print } };
  }

  const { data: master, error: masterError } = await db.from("clients")
    .select("id,kind,status,full_name,company_name,trade_name,birth_date,founding_date,address_city").eq("id",id).maybeSingle();
  const anniversary = master && master.status === "active" ? resolveMasterAnniversary(master) : null;
  if (masterError || !master || !anniversary) {
    return { error: "Nascimento/fundação indisponível. Verifique o cadastro." };
  }
  const [year,month,day] = anniversary.date.split("-").map(Number);
  const { data: existing, error: lookupError } = await db.from("birthday_entries")
    .select("id,source_client_id,origin").eq("id",id).maybeSingle();
  if (lookupError) return { error: "Não foi possível consultar a autorização editorial." };
  if (existing && (existing.source_client_id !== id || existing.origin !== "cadastro")) {
    return { error: "Identificador editorial inconsistente; operação interrompida." };
  }
  if (!existing) {
    const { error: insertError } = await db.from("birthday_entries").insert({
      id,source_client_id:id,group_client_id:id,origin:"cadastro",
      display_name:anniversary.name,
      birth_year:year,birth_month:month,birth_day:day,city:master.address_city||null,
      active:true,publish_in_print:allowed,created_by:userId,
    });
    if (insertError) {
      // If a concurrent action created the link, verify it belongs to this master client.
      const { data: concurrent } = await db.from("birthday_entries")
        .select("source_client_id,origin").eq("id",id).maybeSingle();
      if (!concurrent || concurrent.source_client_id !== id || concurrent.origin !== "cadastro") {
        return { error: "Não foi possível criar o vínculo editorial." };
      }
    } else {
      revalidatePath(PATH);
      return { ok: true, data: { published: allowed } };
    }
  }
  const { data: saved, error } = await db.from("birthday_entries")
    .update({
      publish_in_print:allowed, display_name:anniversary.name,
      birth_year:year,birth_month:month,birth_day:day,city:master.address_city||null,
      updated_at:new Date().toISOString(),
    }).eq("id",id).eq("source_client_id",id).eq("origin","cadastro")
    .select("id,publish_in_print").maybeSingle();
  if (error || !saved) return { error: "Não foi possível salvar a autorização de publicação." };
  revalidatePath(PATH);
  return { ok:true,data:{published:saved.publish_in_print} };
}

export async function prepareBirthdayEditionMessage(
  source: "cliente" | "editorial", id: string, regenerate = false,
): Promise<ActionResult<EditorialBirthdayMessage>> {
  const caller = await permitted();
  if (!caller) return { error: "Acesso não autorizado." };
  if (!UUID.test(id) || (source !== "cliente" && source !== "editorial")) {
    return { error: "Origem inválida." };
  }
  const { db, userId } = caller;
  const currentWeek = currentBirthdayWeekISO();
  let entryId = id;
  let name = "";
  let birthDate = "";
  let city = "";
  let profession = "";
  let organization = "";
  let knownAs = "";
  let messageContext = "";

  if (source === "cliente") {
    const { data: client, error: clientError } = await db.from("clients")
      .select("id,kind,status,full_name,company_name,trade_name,birth_date,founding_date,address_city").eq("id",id).maybeSingle();
    const anniversary = client && client.status === "active" ? resolveMasterAnniversary(client) : null;
    if (clientError || !client || !anniversary) {
      return { error: "Preencha primeiro o nascimento (pessoa física) ou a fundação (instituição) no Cadastro." };
    }
    name = anniversary.name;
    birthDate = anniversary.date;
    city = client.address_city || "";
    // The linked editorial record reuses the UUID of its own master client, preventing
    // duplicate linked people on concurrent button clicks without any schema migration.
    const [year, month, day] = birthDate.split("-").map(Number);
    const { data: existingEntry, error: lookupError } = await db.from("birthday_entries")
      .select("id,origin,source_client_id,active").eq("id", id).maybeSingle();
    if (lookupError) return { error: "Não foi possível localizar o registro editorial." };
    if (existingEntry && (existingEntry.origin !== "cadastro" || existingEntry.source_client_id !== id)) {
      return { error: "Identificador editorial inconsistente; operação interrompida." };
    }
    if (!existingEntry) {
      const { error: insertError } = await db.from("birthday_entries").insert({
        id, source_client_id: id, group_client_id: id,
        origin: "cadastro", display_name: name,
        birth_year: year, birth_month: month, birth_day: day,
        city: city || null, active: true, publish_in_print: false, created_by: userId,
      });
      if (insertError) {
        // Another request may have inserted it simultaneously: verify identity before proceeding.
        const { data: concurrent } = await db.from("birthday_entries")
          .select("source_client_id,origin").eq("id",id).maybeSingle();
        if (!concurrent || concurrent.source_client_id !== id || concurrent.origin !== "cadastro") {
          return { error: "Falha ao vincular nascimento ao cadastro mestre." };
        }
      }
    } else {
      if (!existingEntry.active) return { error: "Registro editorial desativado." };
      // Keep name and birth date synchronized with the client master.
      const { error } = await db.from("birthday_entries").update({
        display_name: name, birth_year: year, birth_month: month, birth_day: day,
        city: city || null, updated_at: new Date().toISOString(),
      }).eq("id",id).eq("source_client_id",id);
      if (error) return { error: "Não foi possível sincronizar a data de nascimento." };
    }
    entryId = id;
  } else {
    const { data: entry, error } = await db.from("birthday_entries")
      .select("id,source_client_id,display_name,birth_month,birth_day,birth_year,city,profession,organization,known_as,message_context,active")
      .eq("id", id).maybeSingle();
    if (error || !entry || entry.source_client_id || !entry.active) return { error: "Aniversariante editorial indisponível." };
    entryId = entry.id;
    name = entry.display_name;
    birthDate = `${entry.birth_year ?? 2000}-${String(entry.birth_month).padStart(2,"0")}-${String(entry.birth_day).padStart(2,"0")}`;
    city = entry.city || "";
    profession = entry.profession || "";
    organization = entry.organization || "";
    knownAs = entry.known_as || "";
    messageContext = entry.message_context || "";
  }
  if (!birthdayWithinEdition(birthDate, currentWeek)) {
    return { error: "A mensagem só pode ser preparada para aniversários da semana atual do jornal." };
  }
  const { data: previousRows, error: messageError } = await db.from("birthday_edition_messages")
    .select("birthday_entry_id,edition_week_start,message,family,opening,ending,manually_edited")
    .eq("edition_week_start", currentWeek);
  if (messageError) return { error: "Não foi possível consultar as mensagens salvas." };
  const old = previousRows?.find(row => row.birthday_entry_id === entryId);
  if (old && !regenerate) return { ok: true, data: old as EditorialBirthdayMessage };
  const usedTexts = new Set<string>();
  const usage = { family: {} as Record<string,number>, opening: {} as Record<string,number>, ending: {} as Record<string,number> };
  for (const row of previousRows ?? []) {
    if (row.birthday_entry_id === entryId) continue;
    usedTexts.add(row.message);
    usage.family[row.family] = (usage.family[row.family] ?? 0) + 1;
    usage.opening[row.opening] = (usage.opening[row.opening] ?? 0) + 1;
    usage.ending[row.ending] = (usage.ending[row.ending] ?? 0) + 1;
  }
  if (old) usedTexts.add(old.message);
  const dateForBirthday = editionDays(currentWeek).find(d=>d.slice(5)===birthDate.slice(5))!;
  const targetDay = new Date(dateForBirthday + "T12:00:00Z");
  const weekdays = ["DOMINGO","SEGUNDA-FEIRA","TERÇA-FEIRA","QUARTA-FEIRA","QUINTA-FEIRA","SEXTA-FEIRA","SÁBADO"];
  const result = generateBirthdayMessage({
    name, city: city || undefined, profession: profession || undefined,
    organization: organization || undefined, knownAs: knownAs || undefined,
    editorialPhrase: extractSafeEditorialPhrase(messageContext),
    dateLabel: formatEditorialDayLabel(weekdays[targetDay.getUTCDay()],targetDay),
  }, usedTexts, usage, old ? {family:old.family, opening:old.opening, ending:old.ending}: {},
  `${currentWeek}::${entryId}::${regenerate ? Date.now() : 0}`);
  const end = editionDays(currentWeek)[6];
  const { data: saved, error: savedError } = await db.from("birthday_edition_messages").upsert({
    birthday_entry_id: entryId, edition_week_start: currentWeek, edition_week_end: end,
    message: result.text, family: result.family, opening: result.opening, ending: result.ending,
    // Gerar automaticamente (primeira vez ou "Trocar mensagem") sempre volta ao modo
    // automático — edição manual (ver saveManualBirthdayMessage) é uma operação alternativa,
    // nunca combinada com a última mensagem gerada.
    manually_edited: false, message_override: null,
    updated_at: new Date().toISOString(),
  }, { onConflict:"birthday_entry_id,edition_week_start" })
    .select("birthday_entry_id,edition_week_start,message,family,opening,ending,manually_edited").single();
  if (savedError || !saved) return { error: "Não foi possível registrar a mensagem desta edição." };
  revalidatePath(PATH);
  return { ok: true, data: saved as EditorialBirthdayMessage };
}

/** Sobrescreve manualmente o texto já preparado para a edição atual — nunca cria uma
 * mensagem nova "do nada": exige que já exista uma mensagem automática preparada para
 * esta pessoa/edição (mesma regra de "uma mensagem por aniversariante por edição"). */
export async function saveManualBirthdayMessage(entryId: string, text: string): Promise<ActionResult<EditorialBirthdayMessage>> {
  const caller = await permitted();
  if (!caller) return { error: "Acesso não autorizado." };
  if (!UUID.test(entryId)) return { error: "Identificador inválido." };
  const trimmed = clean(text, 600);
  if (!trimmed) return { error: "Informe uma mensagem de até 600 caracteres." };
  const { db } = caller;
  const currentWeek = currentBirthdayWeekISO();
  const { data: existing, error: lookupError } = await db.from("birthday_edition_messages")
    .select("birthday_entry_id").eq("birthday_entry_id", entryId).eq("edition_week_start", currentWeek).maybeSingle();
  if (lookupError) return { error: "Não foi possível consultar a mensagem desta edição." };
  if (!existing) return { error: "Prepare a mensagem automática desta semana antes de editar manualmente." };
  const { data: saved, error } = await db.from("birthday_edition_messages").update({
    message: trimmed, message_override: trimmed, manually_edited: true, updated_at: new Date().toISOString(),
  }).eq("birthday_entry_id", entryId).eq("edition_week_start", currentWeek)
    .select("birthday_entry_id,edition_week_start,message,family,opening,ending,manually_edited").single();
  if (error || !saved) return { error: "Não foi possível salvar a edição manual da mensagem." };
  revalidatePath(PATH);
  return { ok: true, data: saved as EditorialBirthdayMessage };
}

const PHOTO_UUID = UUID;

/** Foto de destaque opcional — reaproveita o mesmo pipeline de upload (R2 + media_assets)
 * usado por Publicidade/Mídias, nunca um storage novo. Nunca altera o cadastro mestre. */
export async function setBirthdayEntryPhoto(entryId: string, formData: FormData): Promise<ActionResult<{ photoUrl: string }>> {
  const caller = await permitted();
  if (!caller) return { error: "Acesso não autorizado." };
  if (!PHOTO_UUID.test(entryId)) return { error: "Identificador inválido." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione uma imagem." };
  const { db } = caller;
  const { data: entry, error: lookupError } = await db.from("birthday_entries").select("id,active").eq("id", entryId).maybeSingle();
  if (lookupError || !entry || !entry.active) return { error: "Aniversariante editorial indisponível." };
  try {
    const uploaded = await uploadOptimizedImageToR2(file);
    const asset = await registerUploadedMediaAsset(db, {
      title: "Destaque — aniversariante",
      storagePath: uploaded.storagePath,
      publicUrl: uploaded.publicUrl,
      fileName: uploaded.fileName,
      mimeType: uploaded.mimeType,
      width: uploaded.width,
      height: uploaded.height,
    });
    const { error } = await db.from("birthday_entries")
      .update({ photo_media_asset_id: asset.id, updated_at: new Date().toISOString() }).eq("id", entryId);
    if (error) return { error: "Não foi possível salvar a foto de destaque." };
    revalidatePath(PATH);
    return { ok: true, data: { photoUrl: uploaded.publicUrl } };
  } catch (uploadError) {
    const message = uploadError instanceof InvalidImageUploadError ? uploadError.message : "Não foi possível enviar a imagem.";
    return { error: message };
  }
}

export async function removeBirthdayEntryPhoto(entryId: string): Promise<ActionResult> {
  const caller = await permitted();
  if (!caller) return { error: "Acesso não autorizado." };
  if (!PHOTO_UUID.test(entryId)) return { error: "Identificador inválido." };
  const { error } = await caller.db.from("birthday_entries")
    .update({ photo_media_asset_id: null, updated_at: new Date().toISOString() }).eq("id", entryId);
  if (error) return { error: "Não foi possível remover a foto de destaque." };
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}
