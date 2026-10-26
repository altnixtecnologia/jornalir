-- Auditoria funcional (26/10/2026) — complemento ao dps_id (ver
-- 20261026100000): sem o XML ASSINADO exato que foi transmitido, uma
-- regularização manual posterior (depois de confirmar a chave de
-- acesso real via canal humano/fora de banda — nunca parseando
-- automaticamente um formato não confirmado) teria que RECONSTRUIR a
-- DPS do zero, o que gera um dhEmi/assinatura DIFERENTES do que
-- realmente foi enviado — quebrando o vínculo fiel com a DPS
-- original. Grava o XML assinado como snapshot imutável no momento da
-- tentativa, reaproveitado byte a byte por
-- TransmissionService.resolvePendingAttemptWithAccessKey() se for
-- necessário completar o registro depois.
-- NÃO aplicada ainda — arquivo local, nunca aplicada remotamente sem
-- autorização explícita.
alter table public.nfse_transmission_attempts
  add column if not exists signed_dps_xml text;

comment on column public.nfse_transmission_attempts.signed_dps_xml is
  'XML assinado da DPS exatamente como foi transmitido (ou estava pronto pra ser) nesta tentativa — snapshot imutável, nunca re-montado/re-assinado depois (um novo dhEmi/assinatura não corresponderia ao que a SEFIN efetivamente recebeu). Usado por TransmissionService.resolvePendingAttemptWithAccessKey() pra completar o registro fiscal de uma tentativa "pending"/"uncertain" com fidelidade real à DPS original.';
