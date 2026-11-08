"use server";

import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import {
  commercialInvitationPending, findCommercialInvitation,
} from "../lib/signatures/commercialSignatures";
import {
  findSignatureInvitation, invitationIsPending,
} from "../lib/signatures/contractSignatures";
import {
  googleSignatureEnabled, issueGoogleSignatureNonce, validateGoogleSignatureNonce,
  verifyGoogleSignatureCredential,
} from "../lib/signatures/googleSignatureProof";

type Mode = "commercial" | "institutional";
type Result<T> = { error: string } | ({ ok: true } & T);
type ValidInvite = { id: string; email: string; authUserId: string };

async function requireInvitedSigner(mode: Mode, token: string): Promise<ValidInvite> {
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Convite inválido.");
  const client = createSupabaseServerClient();
  const { data: userResult, error } = await client.auth.getUser();
  const user = userResult.user;
  if (error || !user?.id || !user.email || !user.email_confirmed_at) {
    throw new Error("Confirme primeiro o código recebido no e-mail deste convite.");
  }

  if (mode === "commercial") {
    const invitation = await findCommercialInvitation(token);
    if (!invitation || !commercialInvitationPending(invitation)) throw new Error("Convite indisponível.");
    const expectedEmail = invitation.commercial_signature_participants.signer_email.toLowerCase();
    if (user.email.toLowerCase() !== expectedEmail ||
      invitation.verified_user_id !== user.id || !invitation.verified_at) {
      throw new Error("Confirme o código de e-mail deste convite antes de usar Google.");
    }
    return { id: invitation.id, email: expectedEmail, authUserId: user.id };
  }
  const invitation = await findSignatureInvitation(token);
  if (!invitation || !invitationIsPending(invitation)) throw new Error("Convite indisponível.");
  if (user.email.toLowerCase() !== invitation.signer_email.toLowerCase()) {
    throw new Error("A conta autenticada não corresponde ao e-mail do convite.");
  }
  return { id: invitation.id, email: invitation.signer_email.toLowerCase(), authUserId: user.id };
}

export async function getGoogleSignatureChallengeAction(input: {
  mode: Mode; token: string;
}): Promise<Result<{ clientId: string; nonce: string }>> {
  try {
    if (!googleSignatureEnabled()) return { error: "Google opcional ainda não está configurado neste ambiente." };
    if (input.mode !== "institutional" && input.mode !== "commercial") return { error: "Modalidade inválida." };
    await requireInvitedSigner(input.mode, input.token);
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_SIGNATURE_CLIENT_ID as string;
    const secret = process.env.SIGNATURE_GOOGLE_NONCE_SECRET as string;
    return { ok: true, clientId, nonce: issueGoogleSignatureNonce(input.token, input.mode, secret) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível iniciar a confirmação Google." };
  }
}

export async function confirmGoogleSignatureEvidenceAction(input: {
  mode: Mode; token: string; nonce: string; credential: string;
}): Promise<Result<{ verifiedEmail: string; subjectDigest: string }>> {
  try {
    if (!googleSignatureEnabled()) return { error: "Confirmação Google indisponível." };
    if (input.mode !== "institutional" && input.mode !== "commercial") return { error: "Modalidade inválida." };
    const invitation = await requireInvitedSigner(input.mode, input.token);
    const secret = process.env.SIGNATURE_GOOGLE_NONCE_SECRET as string;
    validateGoogleSignatureNonce(input.nonce, input.token, input.mode, secret);
    const proof = await verifyGoogleSignatureCredential(
      input.credential, input.nonce, invitation.email,
      process.env.NEXT_PUBLIC_GOOGLE_SIGNATURE_CLIENT_ID as string,
    );
    const admin = createSupabaseAdminClient();
    const column = input.mode === "commercial" ? "commercial_invitation_id" : "institutional_invitation_id";
    const { data: previous, error: readError } = await admin
      .from("contract_signature_google_evidence")
      .select("provider_subject, verified_email, google_auth_user_id")
      .eq(column, invitation.id).maybeSingle();
    if (readError) throw new Error("Não foi possível consultar a evidência Google.");
    if (previous) {
      if (previous.provider_subject !== proof.subject ||
        previous.verified_email !== proof.email ||
        previous.google_auth_user_id !== invitation.authUserId) {
        return { error: "Este convite já possui outra conta Google confirmada. Contate o responsável pelo contrato." };
      }
    } else {
      const { error: insertError } = await admin.from("contract_signature_google_evidence").insert({
        [column]: invitation.id,
        provider_subject: proof.subject,
        verified_email: proof.email,
        google_auth_user_id: invitation.authUserId,
      });
      if (insertError) {
        // Corrida de dois cliques: nunca substituir evidência existente.
        const { data: raced } = await admin.from("contract_signature_google_evidence")
          .select("provider_subject, verified_email, google_auth_user_id")
          .eq(column, invitation.id).maybeSingle();
        if (!raced || raced.provider_subject !== proof.subject ||
          raced.verified_email !== proof.email ||
          raced.google_auth_user_id !== invitation.authUserId) {
          throw new Error("Não foi possível registrar a evidência Google.");
        }
      }
    }
    return {
      ok: true, verifiedEmail: proof.email,
      subjectDigest: createHash("sha256").update(proof.subject).digest("hex").slice(0, 16),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível confirmar a conta Google." };
  }
}
