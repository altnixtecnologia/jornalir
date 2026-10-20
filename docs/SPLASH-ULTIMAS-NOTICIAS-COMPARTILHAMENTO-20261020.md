# Jornal IR — splash 2,5s, últimas notícias e compartilhamento (20/10/2026)

## Entrega solicitada
1. Reduzir animação de abertura no WebView Capacitor de 5 segundos para 2,5 segundos, com revelação de portal em zoom e fade, para não cortar seco.
2. Últimas Notícias: remover Ler matéria; foto e títulos abrem artigo diretamente. Os números à direita ainda escolhem uma notícia para destaque.
3. Compartilhamento clean: menu discreto por matéria, copiar link, WhatsApp, Facebook, Instagram com menu nativo ou cópia para Direct, Mais opções do celular.

## Código
- AndroidOpeningScreen.tsx: mínimo 2500ms e máximo 5000ms se página não está pronta; saída animada 720ms (overlay fade/scale 1.065, portal scale .92→1 e blur→0). Não altera APK e não substitui o splash nativo Android, que continua uma ideia para próxima versão após avaliação.
- PublicLatestNewsList.tsx: título e foto grandes clicáveis; número lateral mantém seleção; título lateral também abre artigo; removido Ler matéria. Rotação mantida.
- ArticleShareActions.tsx em notícia pública: URLs públicas HTTPS, clipboard API e fallback WebView, share WhatsApp, Facebook, Instagram por Web Share nativo quando disponível; caso contrário copia para colar no Direct. Instagram não possui URL web para postar um link diretamente em feed/Stories. Opção Mais opções abre nativo, se disponível.
- Metadados OpenGraph para WhatsApp/Facebook já existentes na notícia, preservados.

## QA
- Android v.00.03 homologação: 2,5s + 720ms de transição; não repetir ao navegar. Chrome não mostra abertura.
- Últimas notícias: foto e todos os títulos encaminham para notícia correta; número lateral ainda alterna seleção.
- Notícia: copiar link, Facebook, WhatsApp, Instagram nativo ou fallback; menu fecha fora ou Escape; controle acessível; OG prévia funcionando.
- Layout em mobile, retorno Android, FCM e galeria intactos.

## Não alterar
Sem banco, migrations, APK, Firebase, R2, Vercel sistema ou cadastro de versão. Atualização via site público.
Claude Code deve git status / git fetch e preservar stash/commits locais; não reset/force nem deploy duplicado.
## Produção verificada em 20/10/2026
- Preview inicial `dpl_8r5W2w8WvXKX3FVXcduU7GCvikxA` falhou por tipo de temporizador `ReturnType<typeof setTimeout>` incompatível com `window.setTimeout`; corrigido antes do deploy final.
- Preview final Vercel **READY** `dpl_B4bxRRvZ8sDH1WfoMPbechKXaXme`. Next build e validação TypeScript passaram.
- **Production READY** no projeto `jornalir`, deployment `dpl_4qqTbLGj73UCDAp1A5N6HPJPHKUm`, código SHA `0a12656ca71f03c05e6473b3ec98133fbb5bfb41`.
- Endereço oficial `https://jornalir.vercel.app`: home HTTP 200, bloco Últimas Notícias presente e sem texto "Ler matéria"; artigo real 19º BPM HTTP 200 e botão "Compartilhar" presente; `/aplicativo` HTTP 200 ainda mostra corretamente "Aguardando liberação do APK".
- **Ainda pendente teste funcional no aparelho real** da animação, abertura e Web Share Instagram/nativo. HTML 200 e build não comprovam que o Android forneça um alvo Instagram no menu; fallback de cópia preservado.
- APK v.00.03 permanece **homologação**; nenhum envio ao R2 oficial nem registro publicado pela entrega; releases e automações FCM intocados.
