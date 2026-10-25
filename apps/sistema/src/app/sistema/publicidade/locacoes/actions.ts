"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../lib/permissions/checkModuleAction";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

const PATH = "/sistema/publicidade/locacoes";
type Result = { error: string } | { ok: true };

function failure(error: unknown): Result {
  return { error: error instanceof Error ? error.message : "Não foi possível concluir a operação." };
}
function money(value: string, label: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error(label + ": digite um valor válido em reais com ponto decimal.");
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 9999999999.99) throw new Error(label + ": valor fora do limite.");
  return n;
}
function iso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("Selecione data e horário válidos para a locação.");
  }
  return value;
}
function required(value: string, label: string, limit = 200): string {
  const s = value.trim();
  if (!s || s.length > limit) throw new Error(label + ": preenchimento obrigatório (até " + limit + " caracteres).");
  return s;
}
async function permission(action: "locacao_equipamentos_gerenciar" | "locacao_reservas_gerenciar" | "locacao_vistorias_registrar"): Promise<string | null> {
  return checkModuleAction("publicidade", action);
}

export interface RentalAssetFormInput {
  productId: string;
  assetCode: string;
  brand: string;
  model: string;
  serialNumber: string;
  description: string;
  accessoryInventory: string;
  conditionNotes: string;
}
export async function createRentalAssetAction(input: RentalAssetFormInput): Promise<Result> {
  const denied = await permission("locacao_equipamentos_gerenciar");
  if (denied) return { error: denied };
  try {
    const client = createSupabaseServerClient();
    const actor = await getAuditContext(client);
    const { data, error } = await client.from("rental_assets").insert({
      product_id: required(input.productId,"Produto",40),
      asset_code: required(input.assetCode,"Identificação",60).toUpperCase(),
      brand: required(input.brand,"Marca",120),
      model: required(input.model,"Modelo",120),
      serial_number: input.serialNumber.trim() || null,
      description: input.description.trim() || null,
      accessory_inventory: input.accessoryInventory.trim() || null,
      condition_notes: input.conditionNotes.trim() || null,
      created_by: actor.actorId,
    }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Falha no cadastro de equipamento.");
    await recordAuditEventSupabase(client, {
      userId: actor.actorId, entityType: "rental_asset", entityId: data.id,
      action: "create", metadata: { assetCode: input.assetCode.trim().toUpperCase() },
    });
  } catch (error) { return failure(error); }
  revalidatePath(PATH);
  return { ok: true };
}

export async function changeRentalAssetStatusAction(
  id: string, status: "available" | "maintenance" | "retired",
): Promise<Result> {
  const denied = await permission("locacao_equipamentos_gerenciar");
  if (denied) return { error: denied };
  try {
    const client = createSupabaseServerClient();
    const actor = await getAuditContext(client);
    const { data, error } = await client.from("rental_assets").update({
      status, updated_at: new Date().toISOString(),
    }).eq("id", id).select("id").maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "Equipamento não encontrado ou sem autorização.");
    await recordAuditEventSupabase(client, {
      userId: actor.actorId, entityType: "rental_asset", entityId: id,
      action: "change_status", metadata: { status },
    });
  } catch (error) { return failure(error); }
  revalidatePath(PATH);
  return { ok: true };
}

export interface RentalBookingFormInput {
  commercialSaleId: string;
  assetId: string;
  startAt: string;
  endAt: string;
  collectionLocation: string;
  returnLocation: string;
  contactPerson: string;
  dailyRate: string;
  agreedTotal: string;
  depositAmount: string;
  notes: string;
}
export async function createRentalBookingAction(input: RentalBookingFormInput): Promise<Result> {
  const denied = await permission("locacao_reservas_gerenciar");
  if (denied) return { error: denied };
  try {
    const start = iso(input.startAt), end = iso(input.endAt);
    if (new Date(end).getTime() <= new Date(start).getTime()) throw new Error("Devolução deve ser posterior à retirada.");
    const client = createSupabaseServerClient();
    const actor = await getAuditContext(client);
    const { data, error } = await client.from("rental_bookings").insert({
      commercial_sale_id: required(input.commercialSaleId,"Venda",40),
      asset_id: required(input.assetId,"Equipamento",40),
      start_at: start, end_at: end,
      collection_location: required(input.collectionLocation,"Local de retirada",200),
      return_location: required(input.returnLocation,"Local de devolução",200),
      contact_person: required(input.contactPerson,"Responsável",200),
      daily_rate: money(input.dailyRate,"Diária"),
      agreed_total: money(input.agreedTotal,"Total acordado"),
      deposit_amount: money(input.depositAmount,"Caução"),
      notes: input.notes.trim() || null,
      created_by: actor.actorId,
    }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Não foi possível criar a reserva.");
    await recordAuditEventSupabase(client, {
      userId: actor.actorId, entityType: "rental_booking", entityId: data.id,
      action: "create", metadata: { saleId: input.commercialSaleId, assetId: input.assetId },
    });
  } catch (error) { return failure(error); }
  revalidatePath(PATH);
  return { ok: true };
}

export async function changeRentalBookingStatusAction(
  id: string, status: "reserved" | "checked_out" | "returned" | "cancelled",
): Promise<Result> {
  const denied = await permission("locacao_reservas_gerenciar");
  if (denied) return { error: denied };
  try {
    const client = createSupabaseServerClient();
    const actor = await getAuditContext(client);
    const { data, error } = await client.from("rental_bookings").update({
      status, updated_at: new Date().toISOString(),
    }).eq("id",id).select("id").maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "Mudança não autorizada; confira as vistorias.");
    await recordAuditEventSupabase(client, {
      userId: actor.actorId, entityType: "rental_booking", entityId: id,
      action: "change_status", metadata: { status },
    });
  } catch (error) { return failure(error); }
  revalidatePath(PATH);
  return { ok: true };
}

export interface RentalInspectionInput {
  bookingId: string;
  kind: "checkout" | "return";
  conditionNotes: string;
  accessoriesChecklist: string;
  acknowledgedBy: string;
}
export async function recordRentalInspectionAction(input: RentalInspectionInput): Promise<Result> {
  const denied = await permission("locacao_vistorias_registrar");
  if (denied) return { error: denied };
  try {
    const client = createSupabaseServerClient();
    const actor = await getAuditContext(client);
    const { data, error } = await client.from("rental_inspection_events").insert({
      booking_id: required(input.bookingId,"Reserva",40),
      event_kind: input.kind,
      condition_notes: required(input.conditionNotes,"Estado e avarias",2500),
      accessories_checklist: input.accessoriesChecklist.split("\n").map(s=>s.trim()).filter(Boolean),
      acknowledged_by: required(input.acknowledgedBy,"Responsável pela vistoria",200),
      recorded_by: actor.actorId,
      // Fotos não são anexadas até existir Storage PRIVADO com RLS próprio.
      private_photo_paths: [],
    }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Falha no registro da vistoria.");
    await recordAuditEventSupabase(client, {
      userId: actor.actorId, entityType: "rental_inspection", entityId: data.id,
      action: input.kind, metadata: { bookingId: input.bookingId },
    });
  } catch (error) { return failure(error); }
  revalidatePath(PATH);
  return { ok: true };
}
