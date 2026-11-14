# iOS — Jornal IR e IR Controle | preparação segura (11/11/2026)

## Fonte de verdade e isolamento

**PROPOSTO/IMPLEMENTADO EM BRANCH, NÃO PUBLICADO.** Branch `feat/ios-apps-codemagic-foundation-20261111` derivada da produção do sistema no commit `ac9a834dc0bba576b218f216ead50cc704438c32`.

| Aplicativo | Android existente | Base iOS preparada | ID definitivo | URL |
| --- | --- | --- | --- | --- |
| Jornal IR público | `apps/mobile` (preservado) | Dependência iOS em `apps/mobile`; Xcode gerado na nuvem | `com.jornalir` | URL do portal já configurada no Capacitor |
| IR Controle | `apps/mobile-sistema` está em branch Android antiga divergente | `apps/ios-controle` isolado, sem copiar alterações Android | `com.jornalir.controle` | `https://controle.altnix.com.br` |

O app administrativo Android `feature/ir-controle-mobile-android-20261020` divergiu significativamente da branch oficial. Antes de qualquer reaproveitamento, verificar o VS Code local, os worktrees e os commits mais recentes do Android. **Não sobrescrever, mesclar às cegas nem substituir sua assinatura.**

## Funcionalidades a manter, por prioridade

**IR Controle (P0):** login atual; Agenda e Pauta; avisos visuais nativos de compromissos da própria pessoa; notificações locais agendadas com antecedência configurável; cancelamento/edição/reconciliação; notificações do servidor para atribuições e mudanças; sem duplicação; acesso correto ao compromisso; proteção da sessão e dados. Alarmes sonoros são opcionais: o requisito inegociável é um aviso visual autorizado e persistente na central, na tela bloqueada conforme configuração.

**Jornal IR (P0):** manter absolutamente intactas leitura do portal, distribuição Android, canais de notícia normal/urgente e preferências por localidade/editoria. No iOS ativar push somente após vincular APNs e validar tokens de iPhone, preferências e backend, sem substituir a implementação Android.

**Sem promessa de despertar em silencioso/Foco:** as notificações locais comuns não garantem banner ou som em todos os estados. O Capacitor 7 do projeto não suporta diretamente o parâmetro `interruptionLevel: "timeSensitive"`, disponível em versões posteriores; para maior prioridade será necessário plugin nativo específico ou upgrade testado. Não ativar "critical alerts" sem entitlement da Apple.

## Etapas verificáveis (checklist de aceite)

- [x] Criar projeto iOS do IR Controle separado de Android/Portal, com bundle id definitivo.
- [x] Adicionar suporte iOS ao app público sem alterar build Android.
- [x] Preparar `codemagic.yaml` com dois workflows manuais e **sem publicação**.
- [ ] Executar pela primeira vez os builds no macOS/Codemagic e corrigir eventuais problemas de Xcode/Pods.
- [ ] Gerar projetos Xcode revisados, com ícones, splash, assinatura e capacidades. Definir team Apple.
- [ ] IR Controle: integrar estado autenticado ao agendamento local com limite do iOS (máximo pendente) e permissão explícita.
- [ ] IR Controle: registrar tokens APNs/FCM vinculados ao usuário, respeitar revogação no logout e limpeza de credenciais.
- [ ] IR Controle: push na tela bloqueada / em uso / app encerrado, lembrete e cancelamento com idempotência.
- [ ] Jornal IR: adicionar suporte iOS ao registro dos dispositivos e envio FCM/APNs **sob feature flags separadas**, sem modificar fluxo Android habilitado.
- [ ] Validar banners, Foco, silencioso, iOS mínimo suportado, alternância de usuário, reinstalação, offline e fuso horário no aparelho físico.
- [ ] Auditoria de conteúdo e requisitos App Store para o app público (não ser simples WebView sem funcionalidades nativas).
- [ ] TestFlight interno, distribuição do controle sem loja pública conforme elegibilidade Apple, depois publicação do portal público quando aprovado.

## Codemagic (quando o proprietário terminar o cadastro)

1. No Codemagic, conecte GitHub com acesso **somente** a `altnixtecnologia/jornalir`.
2. Selecione a branch de desenvolvimento acima. Verifique `codemagic.yaml` na raiz.
3. Escolha o workflow `ir-controle-ios-check` para o primeiro teste; ele gera `.app` de simulador sem assinatura. Não instala em iPhone físico.
4. Use depois `jornal-ir-ios-check` para validar o portal.
5. Sem App Store Connect API key, sem APNs e sem contas Apple conectadas nesse primeiro estágio; a assinatura e o dispositivo físico serão configurados apenas após testes de compilação.
6. Não habilite triggers automáticos para não gastar minutos a cada push.

## Proteção da produção

As alterações desta etapa não modificam `apps/site`, `apps/sistema`, migrations Supabase, configurações Vercel ou código-fonte Android. Nenhum deploy nem publicação de app. O Codemagic gera projeto iOS apenas em ambiente de compilação.

A criação no Codemagic **não basta** para entrega de alarmes. A implementação de notificações requer fase separada com APIs e testes reais. Nunca afirmar funcionalidade de push/alarme sem esse teste.
