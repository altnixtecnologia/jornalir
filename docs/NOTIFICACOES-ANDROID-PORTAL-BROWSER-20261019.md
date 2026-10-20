# Jornal IR — correção de notificações Android/navegador (19/10/2026)

## Sintoma recebido da equipe
Captura Android mostrava apenas o formulário **"Receba notícias no celular"** com opções Web Push e mensagem **"Seu navegador não suporta esse recurso. No iPhone..."**, ao entrar no sininho depois de atualizar e ver a tela fechar. Isso não comprova que o aplicativo caiu: a pessoa esclareceu que foi somente a tela de notificações. A seta global Voltar também encobria o título.

## Causa objetiva no código
- `apps/site/src/app/(public)/notificacoes/page.tsx` montava **sempre** `SitePushPreferences`, inclusive dentro do WebView do APK; este componente exige PushManager/ServiceWorker e mostra "navegador não suporta" no Android WebView.
- `NativePushPreferences` estava montado no `layout.tsx` **após** o rodapé e renderizava o painel nessa posição, em vez de dentro da página.
- A captura sozinha não comprova se o aparelho estava abrindo o APK Capacitor oficial, um WebView sem ponte, atalho PWA, ou navegador do Google. Não afirmar origem sem confirmação.

## Correção
- Novo client `NotificationEnvironmentSettings` detecta a ponte Capacitor no cliente. **APK nativo** mostra somente o painel FCM nativo no local correto, via portal; **browser normal** mostra só Web Push.
- **WebView Android sem bridge** mostra diagnóstico de ponte ausente, sem falso formulário Web Push; **atalho independente da Home Screen** mostra orientação para abrir o APK oficial.
- `NativePushPreferences` segue **montado globalmente** para manter listeners em todas as rotas, mas painel de opções é injetado em `#native-push-settings-panel` na página de notificações.
- Título usa `notification-settings-title` com recuo mobile para não ficar sob o botão Voltar.
- Não tocar no Firebase backend, migrações, cron, flags de envio automático, Asaas, apps/mobile nem no APK assinado.
- **QA obrigatório**: APK Android v.00.02 em dois modelos; em /notificacoes deve haver apenas "Notificações do aplicativo" + Normal/Urgente e "Avisos ativos"/"Ativar"; sem aviso de iPhone ou navegador não suportado. Testar permissão e registro FCM, retorno pela seta, primeiro acesso e aberturas subsequentes; navegador Chrome mostra somente configurações Web Push; Google app / WebView sem Capacitor mostra aviso de ambiente inadequado. Nunca confundir estado local "ativo" com recebimento de push real.
- Não afirmar que fechamentos de tela foram corrigidos até obter reproduções/logcat. Ao persistir, coletar apenas logs não sensíveis da Activity/JS antes de mudanças adicionais.
- Branch de trabalho para Claude: `feature/notificacoes-ambiente-android-20261019`. Primeiro `git status`, `git fetch`, preservar arquivos locais e commits Claude, integrar com fast-forward/merge limpo sem reset e sem force.

## Publicação efetuada
- Branch `feature/notificacoes-ambiente-android-20261019`.
- Site **Production READY** `dpl_76YDDHLe3aVjM8nH5XaQ4pLEmFcG`, código SHA `68b300e78bbd8472412acd73c54e341e4a0cdaac`.
- Build prévio READY `dpl_FMHAr1QPQZMBmZLxtkcUTPsv5iyZ`; primeira tentativa `dpl_EYkzBsd2BatSsfKvFM9Noz9oPVvG` falhou apenas por ausência de tipo `react-dom`, corrigido antes da produção por `apps/site/src/types/react-dom.d.ts`.
- Smoke: `https://jornalir.vercel.app/notificacoes` HTTP 200; alias oficial aponta para o deployment READY. **Ainda pendente testar no Android real** para determinar se há ponte Capacitor ou se o atalho é PWA/WebView.
- Nenhuma atualização de APK, Vercel sistema, Supabase, env ou envio FCM neste lote.
