# IR Controle — aplicativo administrativo Android

**Primeira etapa: base nativa criada, APK NÃO compilado/publicado.**

- App público preservado em `apps/mobile` (`com.jornalir`).
- Novo app em `apps/mobile-sistema` (`com.jornalir.controle`), instalável lado a lado.
- Mesma interface do painel online `https://controle.altnix.com.br` via WebView Capacitor 7.
- Android: canais separados para som, vibração, ambos, silencioso; aviso interno. Criados no `Application.onCreate()`, inclusive quando o app é aberto pelo sistema para receber notificações.
- **Importante:** criar canais NÃO envia lembretes; falta ligação Web ↔ Capacitor, autenticação de push e agendamento em aparelho. Nenhum Push Firebase está ativo neste app.
- Android 12+: horários exatos exigem permissão e podem ser negados. Android 13+: mostrar notificações exige permissão. Respeitar modo Não Perturbe e preferências do aparelho.
- `google-services.json` deve ser criado para **este pacote** no Firebase e guardado somente localmente. Não copiar do app público.
- Criar keystore NOVA exclusiva; preservar keystore e branch do aplicativo público. Não versionar assinatura ou segredos.
- Ícones/splash reaproveitados provisoriamente da marca Jornal IR para o protótipo; antes de distribuir, personalizar para distinguir visualmente os aplicativos.

## Para Claude Code no VS Code (apenas quando solicitada a sincronização local)
1. `git fetch origin`; conferir `pwd`, `git status -sb`, worktrees, branch Android v.00.03 e stash.
2. Ler `docs/IR-CONTROLE-APP-ARQUITETURA-20261020.md` e `docs/REGISTRO-DE-ENTREGAS.md`. Trabalhar em worktree isolada da `feature/ir-controle-mobile-android-20261020`. Não mesclar na main divergente.
3. `npm install` na raiz para integrar novo workspace no `package-lock.json`; verificar `npm run typecheck --workspace @ir/sistema`.
4. `npm run sync --workspace @ir/mobile-sistema`, compilar `assembleDebug`, conferir package id `com.jornalir.controle` e WebView redirecionando para Login no domínio oficial.
5. Validar recepção de alertas **somente depois** de implementar preferências, associação segura do dispositivo ao usuário, programação de notificações e FCM dedicado. Testar com app em foreground/background/encerrado e telefone reiniciado.
6. Sem deploy, migração remota, upload de APK ao R2 ou publicação em dispositivos sem aprovação explícita.

Ver documentação principal em `docs/IR-CONTROLE-APP-ARQUITETURA-20261020.md`.
