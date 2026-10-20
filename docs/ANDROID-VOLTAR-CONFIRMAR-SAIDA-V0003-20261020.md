# Jornal IR — Voltar Android e confirmação de saída | v.00.03 (20/10/2026)

## Comportamento aprovado
- Pressão do botão físico / gesto Voltar fecha primeiro a última camada aberta: foto em tela cheia, detalhe/painel de avisos, boas-vindas do push, busca e menu lateral; não volta de página por trás de modal.
- Sem camadas, volta à página anterior pelo histórico do Next.js. Não encerra o app ao ler matérias, navegar por editorias, página de notificações ou acessar fotos.
- Ao abrir uma matéria diretamente pelo FCM e não existir página anterior nesta sessão, Voltar leva à página inicial em vez de fechar.
- Na página inicial sem histórico anterior, Voltar mostra diálogo **“Sair do Jornal IR?”** com **Cancelar** e **Sair**. Cancelar (ou Android Voltar sobre o próprio diálogo) não encerra. Apenas botão Sair chama `App.exitApp()`.
- A seta visual móvel também usa a mesma lógica, sem sair do navegador desktop/Chrome.
- O plugin `@capacitor/app` só age quando a ponte Capacitor nativa está presente. Em navegador/PWA o site continua navegando normalmente, sem simular saída de aplicativo.

## Implementação
- `apps/site/src/components/site/MobileBackButton.tsx`: controlador nativo único, uma inscrição `App.addListener('backButton')`, cleanup sem `removeAllListeners()`, pilha de rotas na sessão e modal de saída com confirmação. Não usar o parâmetro `canGoBack` sozinho: pode conter histórico externo ao portal.
- `apps/site/src/components/site/public/NativePushPreferences.tsx`: botão "Agora não" pode fechar boas-vindas pelo Android Voltar; mantém consentimento voluntário.
- `apps/site/package.json` e `apps/mobile/package.json`: `@capacitor/app@7.1.0`; Android generated `capacitor.settings.gradle` e `app/capacitor.build.gradle` incluem `capacitor-app` (regerar com `npx cap sync android` depois de instalar dependências).
- `apps/mobile/android/app/build.gradle`: **versionCode 4 / versionName v.00.03**, mesmo `applicationId com.jornalir`; assinar exclusivamente com o keystore de release ORIGINAL da v.00.02.
- **MUITO IMPORTANTE:** O site remoto não conserta o hardware Back dos usuários da v.00.02. O listener só funcionará no APK v.00.03 com plugin empacotado.

## Antes de distribuir o APK
1. Claude no VS Code: `git status`, `git fetch`, integrar esta branch sem sobrescrever alterações locais (sem reset, sem force).
2. `npm install` no monorepo para atualizar `package-lock.json` e `npm run typecheck --workspace @ir/site`.
3. `npx cap sync android` a partir de `apps/mobile`, conferir registro `capacitor-app`; executar `./gradlew assembleRelease` em `apps/mobile/android` **usando assinatura original** de `keystore.properties` local.
4. Verificar `aapt dump badging` (`com.jornalir`, v.00.03, code4), `apksigner verify` e certificado igual ao release anterior, SHA-256 e tamanho.
5. Testar no Android físico botão/gesto: menu aberto, busca, painel sininho e detalhe, galeria com zoom, matéria→editoria→início, entrada via push, tela inicial→Cancelar e tela inicial→Sair. Conferir canais FCM normal/urgente preservados, som especial funcionando, token não perdido.
6. Somente após testes, fazer upload do APK com nome imutável ao R2, cadastrar versão no admin e liberar atualização. **Nunca publicar/debug-assinar com certificado diferente**, pois exigiria desinstalação e perderia dados.
7. Registrar a URL, checksum, versão, release e resultado dos testes.

## Limitações
- Não foi possível assinar APK no ambiente de ferramentas conectadas: keystore é local do usuário e NUNCA deve ser enviado à conversa ou GitHub.
- Sem APK v.00.03 instalado, a captura de hardware Back e diálogo nativo não podem ser homologados, embora o site possa compilar.
- Não mexer em Supabase, Firebase, notificações automáticas, produção do sistema ou outros aplicativos.
