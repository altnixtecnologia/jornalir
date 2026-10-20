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

## Estado desta entrega (20/10/2026)
- Código pronto na branch `feature/android-back-navigation-v0003-20261020`; SHA testado no preview: `16610398414664a88e65c77470909dbbb821274c`.
- Preview inicial `dpl_CznkdvqoE8UVgWbuphoCVz1GM5qP` READY, e preview final `dpl_pwUUSJNqiDfEp3cGDwNdM676MmqG` **READY**; Next build, TypeScript e 19 páginas compiladas.
- HTTP 200 em preview `https://jornalir-mlivfppw8-cristians-projects-34074cc3.vercel.app/`. Site oficial ainda aponta ao SHA anterior `b190a2677d574752ef1d8dc2005385d42f103040`, production `dpl_F4eKaJ4mCQCkwYQeVdkE2kiyre1n`. **NÃO foi publicado em produção**, aguardando APK assinado e QA Android.
- Correção adicional de histórico: distinguir popstate real do Next.js de um novo clique no logo "Início". Quando o leitor clica no logo, voltar ao início é uma nova entrada do histórico; não se deve apagar a matéria anterior, evitando exibir "Sair?" antes da hora.
- O teste de build não demonstra ainda o comportamento do botão físico em dispositivos; testar com o APK assinado por CLAUDE LOCAL e relatar resultados. Não há APK v.00.03 criado ou distribuído por este trabalho.
- O lockfile raiz `package-lock.json` permanece desatualizado com a nova dependência; sincronizar e commitar via `npm install` antes de compilar localmente. Não rodar `npm ci` antes disso.
- O Android Gradle já registra manualmente o plugin, mas rodar `npx cap sync android` depois da instalação é necessário para confirmar a geração dos arquivos pela ferramenta.

## ENTREGA OBRIGATÓRIA NO MESMO LOTE — DOWNLOAD DA v.00.03 NO SITE (20/10/2026)
**O usuário exigiu que a geração do APK e a disponibilização no site ocorram juntas**, sem precisar pedir separadamente.
- O Supabase de produção já recebeu a migration `20261020141318_mobile_app_android_release`, e o cadastro `android` está preparado em `version_label=v.00.03`, `version_code=4`, `published=false`. A migration antiga `20261030100400_mobile_app_android_release.sql` NÃO deve ser executada de novo.
- A alteração do site público para eliminar `v.00.00 — em preparação` está na branch independente `feature/download-apk-pagina-oficial-20261020`. Trazer o commit correspondente com merge seguro depois de verificar `git status`; não perder a feature de Voltar nem galeria/LGPD.
- Na **mesma tarefa**: compilar APK release v.00.03 com a **mesma assinatura**, confirmar FCM/áudio, executar testes de Voltar/Cancelar/Sair, enviar ao R2 com nome imutável `aplicativos/android/jornal-ir-v.00.03.apk`, verificar arquivo e SHA-256, **cadastrar e liberar no sistema** `https://controle.altnix.com.br/sistema/configuracoes/aplicativo` com versão 4, URL, bytes, hash e notas.
- Por fim, abrir `https://jornalir.vercel.app/aplicativo` sem sessão e **confirmar que o botão Baixar aplicativo para Android (APK) realmente aparece e baixa o arquivo correto**; conferir SHA-256 do download.
- Se não houver acesso ao R2/keystore/admin, informar explicitamente o bloqueio e não declarar pronto; `published` deve continuar `false`. Não publicar link falso ou v.00.02 que só existia localmente.
- Handoff completo e critérios técnicos: `docs/APK-PUBLICACAO-AUTOMATICA-NA-PAGINA-20261020.md` na branch do site `feature/download-apk-pagina-oficial-20261020`. 
