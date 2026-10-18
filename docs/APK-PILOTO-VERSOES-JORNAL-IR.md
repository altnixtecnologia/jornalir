# Jornal IR — APK piloto e controle de versões

## O que foi preparado
- Versão inicial **v.00.00** (Android versionCode 1, package `br.com.jornalir.app`).
- Configurações > Aplicativo Jornal IR: controla versão atual, download, integridade e publicação.
- Site público `/aplicativo`: informa a versão e disponibiliza um botão **somente** quando houver APK validado e marcado como publicado.
- Meta-dados em `public.mobile_app_releases` (migration `20261030100400_mobile_app_android_release.sql`, inicial `published=false`). Nenhum APK é liberado pela criação da tabela.
- Os arquivos APK **não** entram no repositório; usar bucket R2 público do Jornal IR, na pasta `aplicativos/android/` com nome versionado.

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

## Segurança e custos
- Não aplicar migration, não enviar push real, não publicar nas lojas sem autorização.
- APK pode ser distribuído por link HTTPS sem loja, desde que respeitadas as confirmações do sistema Android.
- Não inserir certificados, chaves de assinatura, tokens FCM ou credenciais do R2 no GitHub. O sistema não faz upload do APK, somente a indicação de arquivo já verificado.
- O texto mostra versão **disponibilizada**; a versão **instalada** no celular exige futura consulta nativa do package via Capacitor App.
