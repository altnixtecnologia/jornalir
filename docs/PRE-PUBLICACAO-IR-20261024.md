# PRÉ-PUBLICAÇÃO — Jornal IR (24/10/2026)

**Estado: auditoria de release em andamento. NÃO AUTORIZA DEPLOY.**  
**Fonte de verdade:** PR #15 (`feature/homologacao-integrada-ir-20261023`), roteiros de módulos, issues #18.
**Escopo para a primeira publicação:** portal, sistema editorial e administrativo/financeiro homologado. **NFS-e somente DEPOIS da publicação.** Integração com **Altnix Informativo somente em um lote futuro**, sem tocar seu código, banco, players, equipamentos, playlists ou mídias agora.

## A. Evidência já confirmada

- `apps/site/vercel.json` e `apps/sistema/vercel.json` têm `git.deploymentEnabled: false`. Isso **não substitui** conferência do painel da Vercel nos projetos `jornalir` e `jornalir-sistema`.
- PR #15 é **draft** e tem como base `feature/abrangencias-geo-notificacoes-20261021`, NÃO `main`.
- Comparação GitHub em 24/10: PR #15 está **446 commits à frente** dessa base, com cerca de **243 arquivos alterados**. Frente à `main`, a branch está **1465 commits à frente e 1 atrás** (linhagens divergentes); o commit singular de `main` adiciona o guia de integração bilateral desatualizado, que já foi explicitamente marcado superado na PR de trabalho. Comparação de GitHub pode limitar inventário de arquivos em retornos grandes — **não usar contagem isolada como plano de merge**.
- Os workflows rodam build TypeScript do site e sistema, RLS financeiro e reconstrução de migrations em Supabase efêmero. **CI verde não prova** migração do banco real, login, envio de e-mails, Pix, Web Push, R2 ou comportamento visual.
- Consulta somente de leitura à **Vercel** confirma os projetos `jornalir` (domínios incluindo `jornalir.vercel.app`) e `jornalir-sistema` (incluindo `controle.altnix.com.br`). Último deploy retornado para o site tinha status `CANCELED`, e para o painel `READY`, ambos sem indicação de alvo Production nessa consulta. **Isso NÃO prova que os domínios de produção estejam atualizados nem que o Git Auto Deploy esteja desligado**; essas informações seguem pendentes de conferência.
- Limitações dos workflows a validar em auditoria: `npm ci` tem fallback para `npm install` e `supabase db lint` usa `|| true`. Logo, aprovação do CI **não certifica lockfile reproduzível nem lint de migrações sem advertências**; ambos precisam de avaliação antes do release.
- No release em preparo, `NFSE_AVAILABLE_IN_THIS_RELEASE=false`: oculta os menus NFS-e e bloqueia rotas administrativas, autorização de Server Actions e ações fiscais excepcionais (certificado/consulta). Não destruir a implementação; reabilitar **só depois do go-live**, com aval e homologação fiscal.
- `ALTNIX_CLIENT_EXPORT_RELEASED=false` mantém a API de consulta externa fechada, independentemente de flags e segredo. Nenhuma integração remota ou comando de mídia faz parte desta publicação.
- Patrocinadores do portal: **100% bônus gratuito, inserção/remoção manual**, sem cliente obrigatório, faturamento, contratos ou suspensão automática.

## B. Gates que impedem publicar (ainda não realizados)

| Frente | Conferência obrigatória | Status |
|---|---|---|
| Controle de branches | Revisar ancestry/base/main, confrontar diferenças com o VS Code/Claude/Codex, definir **branch de release própria** e revisar diff final antes de qualquer merge | **PENDENTE** — main divergente |
| Migrações | Comparar `supabase_migrations.schema_migrations` do projeto remoto com inventário da branch; verificar ordem, idempotência, dependências e impacto em RLS antes de aplicar; fazer backup e ensaio de rollback | **PENDENTE**, sem acesso ou alteração remota autorizados |
| Auth / usuários | SMTP e autenticação de domínio, convites/recovery reais em caixa de teste, nome de usuário e permissão de owner/admin/operador, signatário externo sem acesso ao painel | **PENDENTE** |
| Editorial / Portal | Criar rascunho, imagem/capa estrela, recorte desktop, publicação/agendamento, portal/SEO/compartilhamento, abertura suave, mobile e cache | **PENDENTE** de QA visual autenticado |
| Jornal Online | Testar PUT de PDF/capa no **R2** homologado, SHA/duplicidade, importação em rascunhos, leitor desktop e Android, zoom, HTTP Range/CORS, acervo legado | **PENDENTE** |
| Aniversariantes | Layout aprovado, DD/MM com ano opcional, instituições, `Novo +`, hover do X, não duplicar, atualização sem F5, relatório semanal | **PENDENTE** |
| Agenda / Pauta | Reunião/convidados/aceite/recusa por perfil, lembrete e opt-in do Web Push em aparelho de laboratório, Telegram de grupo em homologação | **PENDENTE** |
| Patrocinadores e Assine | Seis posições, ordem/rotação, ativa/inativa manual, telas PC/mobile, ativação Assine/Anuncie separada de patrocinadores | **PENDENTE** |
| Financeiro | Asaas **Sandbox**: emissão Pix, baixa via webhook autenticado, idempotência, cancelamento/estorno, valor parcial, crédito, permissões detalhadas de operador e WhatsApp aprovado com número de teste; nenhum Pix real | **PENDENTE** |
| Contratos comerciais | Revisão jurídica do texto, PDF original/aditivo, evidências, e-mail/OTP, assinaturas múltiplas em homologação e recuperação após falha | **PENDENTE** |
| NFS-e | **Fora da primeira publicação**. Confirmar módulo oculto, rota e ações bloqueadas; não configurar certificado/serviço fiscal real | **TRAVA DE CÓDIGO** — exigir CI |
| Altnix Informativo | **Fora da primeira publicação**. API local de exportação bloqueada e repositório Altnix intocado; não ativar ou migrar nenhuma integração | **TRAVA DE CÓDIGO** — exigir CI |
| Infra / domínio | Confirmar Vercel Git Deploy desligado no **dashboard de ambos os projetos**; verificar env scopes Preview vs Production, URLs, Supabase Pro, R2 e limites de upload; revisar segredo Asaas LIVE indevidamente associado a Preview | **PENDENTE** |
| Publicação e reversão | Plano de backup com restore ensaiado, release SHA, ordem de migrações e deploys, smoke HTTP, checklist GO/NO-GO, responsáveis e reversão; autorização específica do proprietário | **PENDENTE** |

**Não trocar PENDENTE por CONCLUÍDO apenas porque passou unit test.** Nenhuma credencial, valor de segredo ou dado pessoal deve aparecer nos documentos, logs de CI ou comentários de PR.

## C. Sequência segura do release — somente mediante aprovação específica

1. Congelar mudanças na PR #15, capturar SHA final e abrir revisão de código; **não fazer merge direto dessa PR em `main`**. Auditar base/ancestry e reconciliar divergências documentais sem apagar histórico.
2. Comparar a cópia VS Code com os remotos atuais **somente quando Codex/Claude precisarem atuar**, respeitando a regra do proprietário; nunca `git reset --hard`, force-push ou deploy automático para sincronizar.
3. Revisar migrations contra o remoto **por leitura**; elaborar plano de atualização de banco e backups, em projeto de homologação descartável primeiro. Não rodar `db push` no ambiente real sem aval.
4. Validar Vercel Settings → Git dos dois projetos, scope de variáveis e URLs (especialmente produção/Preview), e desabilitar saídas reais para e-mail, WhatsApp, Pix, notificação, fiscal e Altnix durante testes.
5. Executar testes de cada frente com usuários/perfis de laboratório, guardar evidências (sem informações sensíveis) e obter aprovação de UX/jurídico.
6. Criar commit/tag release identificável e plano de rollback do site, sistema e migrações. Alterações SQL irreversíveis exigem backup e plano de restauração.
7. **Somente após GO explícito:** aplicar migrations autorizadas na sequência ensaiada, publicar site e sistema na ordem aprovada, executar smoke test autenticado e acompanhar logs; reversão pronta se algum gate falhar.
8. Após o portal e sistema estabilizarem: abrir uma **etapa separada de NFS-e** para desenvolvimento/homologação fiscal. Integração completa com Altnix somente depois de toda estrutura de cobranças e mídia ter sido aprovada, por um único lote coordenado.

## D. GO/NO-GO e notas de continuidade

- **NO-GO** enquanto houver falha de CI no SHA final, divergência de branches não conciliada, migrations não conferidas, autorização real faltando ou teste operacional crítico pendente.
- **NO-GO** para NFS-e ou Altnix nesta primeira versão independentemente do sucesso do CI.
- Os testes de release `apps/sistema/test/prepublication-release-gates.test.ts` garantem travas de código e verificam que menus/rotas/Server Actions fiscais são bloqueados. Isso não substitui checagem dos envs reais ou das funções PostgreSQL existentes.
- **Anotações para quem continuar:** a branch experimental `feature/jornalir-clientes-integrados-20261024` no repositório Altnix não deve ser utilizada/mesclada/publicada. A `main` Altnix não foi alterada. A issue #18 descreve requisitos futuros, não uma autorização.
