# Agenda — distinguir compromissos encerrados no calendario

17/11/2026 — Apenas código e testes, sem escrita em dados reais ou deploy.

## Diagnóstico read-only no Supabase oficial
Dois compromissos de Câmaras em 09/11 (São João do Sul e Passo de Torres) constam como **completed**, com `completed_at` e `workflow_closed_at` preenchidos. O contador anterior do calendário tratava todos os eventos não cancelados como ativos, embora concluídos. `agenda_event_assignees.completed_at` pode continuar nulo mesmo depois do encerramento geral: não é razão para reabrir o evento.

O Supabase conectado mostrou **254 migrations** aplicadas, incluindo as atualizações de agenda/pauta `20261122340200` e `20261122340210`. Este ajuste não exige migration.

## Correção
- Fonte visual do encerramento: status `completed` ou `completed_at` ou `workflow_closed_at`; `cancelled` prevalece. Nenhum registro é alterado.
- Dias com pendentes: contador normal de ativos. Dias só com finalizados: ✓ verde e histórico acessível. Resumo do mês separa "em aberto" e "concluídos".
- O cartão concluído usa estilo `is-completed`; não mostra `0/N concluídos` como se ainda aguardasse pessoas.
- A fila pessoal e o aviso de atrasos **da Agenda** não misturam atividades exclusivamente da Pauta.
- Casos de teste incluem os dois compromissos de Câmara e Pauta sem compromisso; sem alteração de responsáveis, andamento ou datas.

## Homologação
Executar CI (testes, typecheck, build) e validar em sessão real, mês 11/2026. Não efetuar deploy nem merge de branches enquanto pendente. A PR #108 (permissões de Configurações) fica independente.
