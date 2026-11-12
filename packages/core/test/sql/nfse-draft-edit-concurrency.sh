#!/usr/bin/env bash
# Ensaio com DUAS conexoes reais ao PostgreSQL efemero do GitHub Actions.
set -euo pipefail
export PGOPTIONS="-c statement_timeout=10000"
psql -v ON_ERROR_STOP=1 <<'SQL' >/tmp/nfse_claim_session.log &
begin;
select id from public.nfse_drafts
 where id='00000000-0000-0000-0000-000000000003' for update;
update public.nfse_drafts set transmission_locked_at=now()
 where id='00000000-0000-0000-0000-000000000003';
select pg_sleep(2);
commit;
SQL
claim_pid=$!
sleep 0.6
# O UPDATE abaixo espera o COMMIT do claim, relê o lock e deve falhar.
if psql -v ON_ERROR_STOP=1 -c "update public.nfse_drafts set service_value=900.00 where id='00000000-0000-0000-0000-000000000003'" > /tmp/nfse_edit_result.log 2>&1; then
  echo "FALHA: edicao fiscal ocorreu durante transmissao concorrente"
  exit 1
fi
wait "$claim_pid"
psql -v ON_ERROR_STOP=1 -Atc "select service_value from public.nfse_drafts where id='00000000-0000-0000-0000-000000000003'" | grep -qx '100.00'
grep -q "Edicao bloqueada" /tmp/nfse_edit_result.log
echo "OK: duas sessoes concorrentes preservaram snapshot e lock fiscal"
