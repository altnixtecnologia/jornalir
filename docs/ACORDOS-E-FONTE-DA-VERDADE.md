# Jornal IR — Acordos, decisões e fonte da verdade

> Criado em 17/10/2026 para impedir regressões, retrabalho e perda de decisões entre conversas, assistentes, branches e computadores.
> **Este documento descreve acordos e critérios. Não constitui evidência de que funcionalidades estão publicadas.** Atualizar depois de cada aprovação ou mudança de escopo.

## 1. Autoridade e compromisso de trabalho (APROVADO PELO USUÁRIO)

1. **O usuário define as necessidades, fluxos e experiência desejada.** O assistente é responsável por propor arquitetura, riscos, alternativas e melhorias funcionais, implementar de forma cuidadosa e validar o resultado. Não alterar uma decisão aprovada silenciosamente.
2. **Uma tela, comportamento ou fluxo previamente aprovado não pode voltar para uma versão antiga** nem desaparecer ao integrar outra branch. Antes de editar, localizar a implementação atual e o histórico de decisões. Se houver melhoria, apresentar o benefício e os impactos; obter aprovação para substituições perceptíveis.
3. **Não reconstruir do zero o que já existe.** Inspecionar o código real, banco, migrations, branches e telas, distinguir 'existe', 'funciona localmente', 'foi validado com serviço real' e 'está publicado'.
4. **Trabalhar em lotes de ~3 tópicos coerentes** (ajuste registrado em 17/10/2026, substitui o "até cinco itens" anterior), seguindo sempre: consultar decisões aprovadas → implementar → testar (sem prejudicar o anterior) → atualizar a documentação `.md` pertinente → commit local → sincronizar GitHub só quando o conjunto estiver pronto e confirmado sem risco de deploy automático → publicar na Vercel só quando autorizado → testar no ambiente oficial. Relatório curto de **feito / falta / impedimentos**, testes relevantes e o que seguirá no lote seguinte; parar quando a etapa solicitar autorização para continuar.
5. **Evitar deploys desnecessários.** É proibido fazer `git push`, deploy Vercel, alterar plano, criar PRs, executar migrations no Supabase remoto, acionar cobranças reais, enviar WhatsApp/e-mail reais ou transmitir NFS-e **sem autorização específica**. Commits locais são aceitáveis quando o lote assim permitir. Atenção: previews automáticos da Vercel também contam como deploy; um push pode dispará-los.
   - **Decisão registrada em 17/10/2026:** `apps/sistema/vercel.json` e `apps/site/vercel.json` (`git.deploymentEnabled: false`) foram preparados para impedir Preview/produção automáticos por push em QUALQUER branch dos dois projetos (`jornalir`, `jornalir-sistema`) — confirmado por `vercel project inspect` que os Root Directory batem exatamente (`apps/site`, `apps/sistema`). Deploy manual (CLI/dashboard) nunca é afetado por essa chave. Antes de confiar 100% nisso no primeiro push que introduz o arquivo, confirmar também no dashboard de cada projeto (Settings → Git) que o toggle de deploy automático está desligado como segurança extra — a documentação oficial da Vercel não garante explicitamente o comportamento do commit que introduz a configuração.
6. **Não usar mudanças destrutivas para corrigir conflitos ou builds**: nada de `git reset --hard`, `git clean -fd`, force push, sobrescrita de `.env`, remoção de dados, mudança de versões aprovadas ou exclusão de arquivos de outra worktree. Checar `git status`, diffs e branches antes de agir.
7. **Preservar segurança e privacidade:** segredos, certificados e credenciais somente no servidor, mínimos privilégios, RLS, logs sem segredos, auditoria rastreável; não simular sucesso de integração, pagamento, entrega ou emissão fiscal.
8. **Antes de desenvolver, consultar este arquivo e `docs/STATUS-E-HANDOFF.md`.** Se não houver acesso a esses documentos, solicitar ao usuário o texto/link/arquivo pertinente em vez de inventar o estado do projeto. Uma conversa nova não substitui o registro do repositório.
9. **Nunca confundir sugestão do assistente com aprovação do usuário.** Registrar toda decisão com status: APROVADO, PROPOSTO, IMPLEMENTADO LOCALMENTE, VALIDADO COM SERVIÇO REAL ou PUBLICADO.
10. **O resultado de testes, builds e relatórios do Claude deve ser revisto criticamente.** Build passando não prova a experiência de uso nem integração real; conferir interface, autorizações, requisitos de negócio, cenários de falha e regressão.

## 2. Configuração conhecida do projeto — verificar no início de cada sessão

- Monorepo `altnixtecnologia/jornalir`: `apps/site` (portal público), `apps/sistema` (painel administrativo), pacotes compartilhados e migrations Supabase.
- Diretório local oficial, após reorganização de 17/10/2026: `C:\Users\caber\OneDrive\Altnix\Projetos\Informativo Regional\Site-sistema`.
- Branch de desenvolvimento local: `consolidacao-local-20261016`. Em 17/10, usuário reportou `c4c02d5` após item 5/lote 2; **o lote 3 de modelos de contratos pode ter avançado desde então. Sempre executar `git status` e `git rev-parse HEAD`.**
- Pastas que **não devem ser alteradas** sem autorização: `Site-sistema-ANTIGO-BACKUP`, `Site-sistema-painel`, `jornalir-consolidacao-local`.
- O novo `Site-sistema` tem repositório Git independente e origin GitHub; os backups/worktrees antigos foram reparados. O GitHub remoto pode estar atrás dos commits locais. **Não assumir que GitHub é a cópia local mais atualizada.**
- Ambientes publicados anteriormente: `controle.altnix.com.br` (sistema), `jornalir.vercel.app` (site). Não publicar em preview desnecessariamente; preservar produção.
- Há dados confidenciais em `.env.local` e a pasta fica no OneDrive. Não imprimir credenciais, não sobrescrever e cuidar de sincronização/locks do Windows.

## 3. Decisões e funcionalidades do produto — preservar comportamento aprovado

### Direção geral e UX

- O Jornal IR é o sistema central de **clientes, contratos, vendas e financeiro**. O Altnix Informativo utiliza o cadastro central para distribuição/gerenciamento de mídias e playlists; **não** criar clientes e cobranças paralelos nem mexer nos players/TVs durante a integração.
- Aparência **moderna, limpa, compacta e responsiva**, mobile-first quando fizer sentido. Reduzir espaços excessivos; não duplicar o mesmo comando em menu e no interior da página. Ações de inclusão preferencialmente **“Novo +” dentro do próprio módulo**.
- Menus e permissões devem ser consistentes desktop/mobile; menu mobile recolhe ao clicar fora. Módulos desativados para um usuário não devem aparecer na navegação. Sempre confirmar que o layout aprovado permaneceu visível após o build.
- Feedbacks do sistema padronizados: mensagens centrais/temporárias (referência: ~5 s), erros evidentes com possibilidade de fechar quando aplicável, sem balões visuais desnecessários.

### Editorial e site

- Notícias: título, subtítulo opcional, corpo editável; fotos opcionais, capa selecionada manualmente e galeria ordenável. Editorias, localidades, status rascunho/agendado/publicado/ajuste, destaque e notificações quando aplicáveis.
- Jornal Online: PDF do impresso, flipbook no desktop, boa experiência mobile; capas devem carregar. Extração de matérias do PDF produz rascunhos revisáveis, não publicação cega. Arquivo histórico R2 foi migrado por implementação consolidada; não recuperar scripts paralelos de migração já concluída sem justificativa.
- Publicidade: slots/posições e ordem configuráveis; prévias/miniaturas, múltiplas imagens, duração por imagem, escala original vs esticada quando disponível. Preservar posicionamento já aprovado, inclusive agrupamentos à direita/esquerda quando aplicável.
- Assine/Anuncie: preservar medidas, organização e textos de cobertura/assinatura aprovados, sem retornar a versões antigas.
- Padrão editorial do Jornal IR: **títulos em MAIÚSCULAS**; horas `HH:MMh` (ex.: `08:00h`); datas com dia da semana + dia entre parênteses (ex.: `quarta-feira (07)`).

### Aniversariantes — módulo especialmente sensível a regressão

- **Manter o layout aprovado mais recente**, não misturar telas antigas e novas. Já houve versões antigas reaparecendo; conferir UI e comportamento, não apenas os componentes.
- Data de nascimento dia/mês/ano; filtros por dia/mês (sem exigir ano) e período padrão semanal. Recurso extraordinário **“Novo +”**; tratar aniversários de pessoas e entidades/CNPJ sem confundir fundação de instituição com nascimento de pessoa.
- Pessoas vinculadas a instituições continuam individuais e publicáveis quando aplicável.
- Mensagens pré-aprovadas (~36), modelos por função/contexto; destaque com foto quando houver. Remoção por X no hover no desktop e acesso visível no mobile; impedir duplicidade e evitar “Retirar” + X redundantes.
- Lista e controles devem reagir à alteração sem exigir F5 quando tecnicamente possível.

### Usuários, permissões e Financeiro

- Admin tem acesso total. Para demais perfis, permitir ocultação do módulo inteiro e restrições de ações; no Financeiro os controles granulares são essenciais: pode **criar/acessar/enviar PIX** mas **não baixar/cancelar**, conforme permissão.
- Duas linhagens divergentes de hardening de permissões (`release/consolidacao-permissoes-20261016-lote1`, `release/finance-permissions-guards-20261015`) **não foram mescladas por escolha deliberada**. Revisar por último, sem copiar indiscriminadamente nem abrir acesso por conveniência.
- Asaas em produção exige idempotência, respeito à permissão, sincronização de pagamentos, ausência de operação fictícia; nunca testar cobrança real sem autorização.

### Contratos / assinador / NFS-e — distinguir implementação de homologação

- Documento contratual original imutável e privado; PDFs gerados ou anexados vinculados a cliente/contrato, comprovantes independentes, convites revogáveis, OTP por e-mail, consentimento e evidências. Assinatura gráfica eletrônica **não** é assinatura digital qualificada ICP-Brasil.
- Múltiplos signatários devem produzir versão consolidada com **todas** as folhas de aceite; não chamar PDFs independentes de “final”. Reenvio precisa criar novo token sem reutilizar link antigo; não armazenar token puro nem OTP em logs.
- Não confundir aceite do envio pela API da Meta com entrega/leitura. Envio automático de assinatura requer template Meta aprovado; fallback manual deve continuar. OTP depende de template/e-mail Supabase Auth adequados.
- NFS-e: dados fiscais reais, competência explícita, município/parâmetros oficiais, série DPS, certificado A1 em cofre criptografado, XSD real, mTLS, prevenção de duplicidades e incerteza de transmissão. **Não inventar alíquotas, códigos fiscais ou sucesso de API.** Operações reais de emissão/cancelamento continuam bloqueadas até certificados e homologação.
- Geração de contratos a partir de **modelos cadastráveis e versionados** era a pendência seguinte ao lote 2; preservar upload manual, permitir prévia e manter versões assinadas.

## 4. Definição de pronto (obrigatória por lote)

- **Feito em código:** diffs identificados, sem exclusão indevida; dependências/migrations avaliadas; cobertura dos critérios de aceitação.
- **Testado localmente:** typecheck, testes relevantes, builds, navegação e UX observáveis, testes de autorização/erros/duplicidade.
- **Testado E2E real:** somente com autorização e ambiente apropriado; informar exatamente o que foi exercitado e o que foi mock.
- **Publicação:** somente após autorização, confirmação de migrações/segredos/rollout/rollback e verificação pós-deploy. Publicar não significa homologar.
- **Relatório ao usuário:** FEITO, FALTA e BLOQUEIOS; listar o que foi comprovado versus somente relatado. Declarar gaps e riscos antes de avançar.

## 5. Ritual obrigatório no início e fim de cada sessão/lote

1. Ler `CLAUDE.md`/`AGENTS.md`, este documento e `docs/STATUS-E-HANDOFF.md`.
2. Identificar pasta real, branch, HEAD, `git status`, worktrees e origem; confirmar ambiente para evitar modificar pasta antiga.
3. Enumerar fluxos aprovados afetados, suas telas e critérios de não regressão; conferir primeiro as implementações existentes.
4. Definir até cinco tarefas, dependências, riscos e testes. Se encontrar comportamento divergente de uma aprovação, corrigir ou explicar antes de expandir o escopo.
5. Implementar apenas no diretório oficial; sem push, deploy, migrações remotas ou tráfego real sem autorização.
6. Validar testes e funcionalidade visível, inclusive em mobile quando aplicável; identificar o que não foi possível testar.
7. Atualizar `docs/STATUS-E-HANDOFF.md` e, se uma decisão foi alterada pelo usuário, atualizar também este documento. Fornecer relatório de FEITO/FALTA/BLOQUEIOS e commit local.

## 6. Como lidar com conversas novas e diferenças entre assistentes

- Este arquivo no repositório funciona como memória de projeto **portável**, não uma memória automática infalível do ChatGPT.
- Claude Code deve ler na abertura do repositório por orientação de `CLAUDE.md`; ChatGPT deve consultar os arquivos via GitHub/conector **quando disponíveis** ou solicitar ao usuário o status/handoff quando não puder acessar os commits locais.
- Não presumir acesso remoto a mudanças locais ainda não enviadas; nunca inventar SHA, testes ou configuração.
- Registrar cada fluxo aprovado em uma seção de decisão ou no handoff, com data, situação, arquivos e evidências (capturas quando o usuário fornecer).

## 7. Pendências históricas explícitas em 17/10/2026 (ver status atualizado)

- Teste E2E real com Supabase para múltiplos signatários e migrations locais preparadas, ainda não aplicadas ao banco remoto no relatório do lote 2.
- Aprovação/configuração do template WhatsApp de assinatura e teste OTP real por e-mail.
- Homologação de emissão/consulta/cancelamento NFS-e com certificado A1 real, XSD e respostas oficiais; produção fiscal permanece bloqueada.
- Revisão das duas branches de permissões financeiras granulares, deliberadamente deixada para etapa posterior.
- Conferir comportamento 404/streaming do Next.js e meta robots, não alterar só porque resposta HTTP 200 pode ocorrer durante streaming.
- Controlar deploys automáticos de prévia: o time Vercel encontrou consumo elevado de cota; **não foi confirmada a desativação dos previews**.


## 20/10/2026 — Decisões aprovadas para Agenda/Pauta/auditoria
- Todos os colaboradores ativos podem ver compromissos de todos, com identificação por cor atribuída a cada pessoa. Agenda/Pauta devem convergir para um único registro, sem ligação manual/duplicata no estado final.
- Cada colaborador conclui a própria parte; múltiplos responsáveis devem progredir separadamente. Proprietário e administradores **explicitamente autorizados** alteram, cancelam e reabrem pendências de qualquer pessoa.
- Mobile prioritário: criar, visualizar, editar quando autorizado, filtrar, concluir com poucos toques; sincronização entre dispositivos sem recarregar manualmente ou perder alterações não salvas.
- Controle completo de modificações no `controle.altnix.com.br`: auditoria imutável por usuário/módulo/data, log de ações automáticas, antes/depois quando seguro, nunca registrar credenciais. Proprietário e admins consultam; operadores apenas quando liberados. Este é um REQUISITO, não uma afirmação de cobertura atual.
- Aplicativo administrativo futuro separado do portal público, com notificações de tarefas e opção de vibração, observando limitações do Android/iOS.
- Primeiro lote em branch remota não publicada: `docs/AGENDA_EQUIPE_MOBILE_AUDITORIA_HANDOFF_20261020.md`. Implementar/homologar sem perder o que existe; não tocar produção ou VS Code sem autorização e integração segura.
