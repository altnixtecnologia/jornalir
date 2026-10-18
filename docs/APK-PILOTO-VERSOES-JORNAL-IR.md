# Jornal IR — APK piloto e controle de versões

## O que foi preparado
- Versão inicial **v.00.00** (Android versionCode 1, package `com.jornalir`).
- Configurações > Aplicativo Jornal IR: controla versão atual, download, integridade e publicação.
- Site público `/aplicativo`: informa a versão e disponibiliza um botão **somente** quando houver APK validado e marcado como publicado.
- Meta-dados em `public.mobile_app_releases` (migration `20261030100400_mobile_app_android_release.sql`, inicial `published=false`). Nenhum APK é liberado pela criação da tabela.
- Os arquivos APK **não** entram no repositório; usar bucket R2 público do Jornal IR, na pasta `aplicativos/android/` com nome versionado.

## Identificador Android definitivo

- `applicationId`, `namespace` e Capacitor `appId`: **`com.jornalir`**; nome que aparece na tela inicial: **Jornal IR**.
- Mudança feita antes da distribuição da primeira versão. O APK debug compilado anteriormente com `br.com.jornalir.app` NÃO representa mais este projeto; **recompilar** depois de sincronizar a branch.
- Evitar alterar esse identificador depois de publicar: o Android o trata como outro aplicativo, impossibilitando uma atualização simples.

## Procedimento de liberação da v.00.00
1. Aplique a migration no Supabase **após autorização**. Implemente/site/sistema primeiro em ambiente de testes.
2. Compile o Android usando o SDK/Gradle local. A base Capacitor ainda usa `server.url` como solução **somente de laboratório/piloto**; está faltando declarar as dependências npm e preparar uma integração nativa estável, portanto um build limpo em outra máquina ainda não é garantido.
3. Instale e teste em aparelho real. Confirme package e versionName usando `aapt dump badging` (ou Gradle).
4. Para a distribuição pública futura, assine com chave segura e **persistente**. Um APK debug pode ser usado para teste restrito, mas provavelmente exigirá desinstalar na futura troca de assinatura; não use debug como distribuição definitiva.
5. Envie o APK real para R2 com MIME `application/vnd.android.package-archive`, `Content-Disposition: attachment`, URL HTTPS e sem colocar segredos no projeto.
6. Calcule `sha256sum <arquivo.apk>` e tamanho em bytes; confirme que a URL abre o mesmo arquivo e o checksum local bate. Use um caminho imutável por versão, sem sobrescrever APK já publicado.
7. No sistema `/sistema/configuracoes/aplicativo`, configure versão, código, URL do APK, SHA256 e tamanho e clique **Liberar APK**. A ação valida HTTPS, domínio R2 autorizado, existência do arquivo e tamanho; a migration exige arquivo preenchido.
8. Confira a página `/aplicativo` no Android e baixe. Ao alterar versões, incremente versionCode sempre que criar novo APK.
9. Antes de publicar nas lojas, substituir o `server.url` de desenvolvimento por arquitetura de WebView apropriada para produção, integrar FCM/APNs, ícones e compliance das lojas.

## Resultado da compilação/publicação do APK (18/10/2026)

- Sincronizado `com.jornalir` (branch já trazia o identificador correto, HEAD
  `e1f4478`). `apps/mobile/package.json` corrigido — não declarava
  `dependencies` (instalado antes com `--no-save`); agora declara
  `@capacitor/core`/`@capacitor/android` 7.6.9 e `@capacitor/cli` 7.6.9 como
  devDependency, reproduzível via `npm install --no-workspaces`.
  `npx cap sync android` executado.
- **Assinatura de release real preparada**, não apenas debug: keystore RSA
  2048 bits gerado (`keytool`), validade 30 anos, guardado **fora do
  repositório** (`keys-mobile/`, com README de backup seguro). Gradle lê a
  senha/caminho de `apps/mobile/android/keystore.properties` (local, nunca
  commitado — `.gitignore` corrigido, antes tinha `*.keystore` comentado).
- `./gradlew assembleRelease` concluído com sucesso (`BUILD SUCCESSFUL`).
  APK: `com.jornalir`, `versionCode=1`, `versionName=v.00.00` (confirmado via
  `aapt dump badging`, não presumido). **3.151.468 bytes**, SHA-256
  `bf223cd5df13125b1fda392916397c95b9d55eebc6e30ccf5e1ca412a6126529`.
- Verificado com `apksigner verify`: `Verifies` = true, assinado com o
  certificado "Jornal Informativo Regional" (v1+v2 scheme). `zipalign -c`:
  alinhamento correto.
- Enviado ao R2 real (`jornalir-media`, mesmo bucket/credenciais já em uso
  pelo projeto) em `aplicativos/android/jornal-ir-v.00.00.apk`,
  `Content-Type: application/vnd.android.package-archive`. Confirmado:
  HTTP 200 na URL pública, download completo + SHA-256 recalculado do
  arquivo baixado = idêntico ao original (integridade de ponta a ponta).
  Chave não existia antes do upload (checado via `HeadObject`) — nenhuma
  versão anterior foi sobrescrita.
- **Link direto:**
  `https://pub-3d61ff8f7b474fcdbaa936f006ba2bf4.r2.dev/aplicativos/android/jornal-ir-v.00.00.apk`
- **NÃO feito nesta etapa** (por instrução explícita): registrar a versão em
  `/sistema/configuracoes/aplicativo` (exige a migration
  `20261030100400_mobile_app_android_release.sql` aplicada — não aplicada
  ainda); liberar o botão em `/aplicativo`; push/deploy. O arquivo já está
  publicado e íntegro no R2, pronto para esse passo quando autorizado.
- Nenhum teste em aparelho/emulador real (só compilação, assinatura e
  integridade do arquivo foram validadas).

## Segurança e custos
- Não aplicar migration, não enviar push real, não publicar nas lojas sem autorização.
- APK pode ser distribuído por link HTTPS sem loja, desde que respeitadas as confirmações do sistema Android.
- Não inserir certificados, chaves de assinatura, tokens FCM ou credenciais do R2 no GitHub. O sistema não faz upload do APK, somente a indicação de arquivo já verificado.
- O texto mostra versão **disponibilizada**; a versão **instalada** no celular exige futura consulta nativa do package via Capacitor App.
