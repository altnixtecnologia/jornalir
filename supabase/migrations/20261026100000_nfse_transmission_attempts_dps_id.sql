-- Auditoria estrutural de durabilidade/recuperação (26/10/2026, Bloco 1,
-- item 2): grava o identificador completo da DPS (buildDpsId) como
-- SNAPSHOT imutável em cada tentativa de transmissão, nunca
-- reconstruído depois a partir da configuração atual do emissor (que
-- pode ter mudado entre a tentativa original e uma eventual
-- reconciliação/consulta pela chave). Sem isto, a recuperação de uma
-- tentativa "pending"/"uncertain" dependia implicitamente de
-- nfse_issuer_configs não ter mudado CNPJ/IBGE entre a tentativa e a
-- consulta — uma dependência frágil e evitável.
-- NÃO aplicada ainda — arquivo local, nunca aplicada remotamente sem
-- autorização explícita.
alter table public.nfse_transmission_attempts
  add column if not exists dps_id text;

comment on column public.nfse_transmission_attempts.dps_id is
  'Identificador completo da DPS (buildDpsId, formato "DPS"+município(7)+tipo(1)+inscrição(14)+série(5)+número(15)) gravado no momento da tentativa — snapshot imutável, nunca reconstruído depois a partir da configuração atual do emissor. Usado por TransmissionService.reconcilePendingAttempt() pra consultar a DPS pelo identificador sem depender de nada que possa mudar com o tempo.';
