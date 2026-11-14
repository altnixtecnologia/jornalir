# IR Controle — base iOS (isolada)

Pacote definitivo `com.jornalir.controle` (distinto do portal público `com.jornalir`).
A base usa Capacitor 7 / WKWebView e abre `https://controle.altnix.com.br` com a autenticação já existente.

## Status real

- Projeto JS e configuração iOS preparados, sem cópia de senhas/tokens.
- O projeto nativo Xcode será gerado no macOS pelo workflow Codemagic; **não existe IPA homologado ainda**.
- **Notificações/alarmes ainda NÃO podem ser declarados funcionais**: é preciso integração autenticada entre Agenda e notificações locais, registro do dispositivo (APNs/FCM), sincronização e testes no iPhone.
- Versão Android original `com.jornalir.controle` está em uma branch antiga divergente; não copiar/mesclar automaticamente sua pasta sobre este projeto iOS.

## Critérios obrigatórios antes de distribuir

1. Abrir, autenticar e navegar para Agenda/Pauta no iPhone.
2. Solicitar permissões somente com consentimento; verificar banners, som opcional, tela bloqueada, Focus e app fechado.
3. Criar lembrete local, cancelar, alterar data/horário, adiar; sincronizar ao abrir/reconectar; remover ao logout.
4. Testar fuso America/Sao_Paulo e eventos fora do mês atual, sem avisos duplicados.
5. Associar APNs/FCM ao usuário autenticado, sem usar tokens/chaves do app público.
6. Manter emissão/publicação de notícias, notificações e Android existentes intactos.

**Não executar assinatura, publicação ou deploy no backend sem homologação e autorização.**
