# Jornal IR — ajustes discretos de destaque mobile e versão instalada

Data: 20/10/2026.

## Escopo aprovado enquanto o usuário testa a v.00.03
- **Splash de abertura NÃO alterado.** Usuário quer avaliar os 5 segundos já publicados primeiro; solicitação futura é splash nativa do Android, ANTES do WebView/portal. Exige implementação nativa/novo APK, não prometer que splash HTML equivale.
- **Versão no menu:** `InstalledAndroidVersion.tsx` continua lendo `App.getInfo()` do APK, mas exibe SOMENTE `info.version` (v.00.03), sem `build 4`. No Chrome/PWA não aparece.
- **Logo flutuante do destaque principal:** classe `hero-safe-logo` aplicada só ao componente `PublicFeaturedHero`; no mobile aumenta folga de topo de 18px para mínimo 36px (ou safe-area + 14px) para sair de perto da câmera. Desktop mantém espaçamento antigo.
- **Respiração da foto da manchete:** cadastro real confirmado na matéria `19º BPM RECEBE 38 POLICIAIS MILITARES TEMPORÁRIOS PARA REFORÇAR O POLICIAMENTO NA REGIÃO`: capa em `article_media` tem 777×1024 (retrato); componente já classifica como `portrait`, e usa `hero-mobile-breathe`. O CSS tinha duas definições de keyframe com mesmo nome; consolidado em uma só e ampliado o zoom-out de **140% → 100%** durante os 15s disponíveis, sem esticar imagem. Ao final a imagem `contain` atinge as bordas laterais naturalmente; blur do fundo permanece. A imagem não é regravada, recortada ou substituída.
- Nenhuma alteração no banco, Firebase, notificações ou APK. Home/sistema seguem os mesmos exceto retoques no destaque.

## QA
1. Na v.00.03 já instalada, abrir menu: somente `v.00.03` no lado oposto às redes; sem texto `build 4`.
2. Em celular com furo/câmera, observar a logo flutuante afastada discretamente para baixo, sem mover texto da manchete.
3. Quando a matéria 19º BPM entrar no carrossel principal, verificar o efeito zoom-out mais visível e imagem acomodada na largura até o fim dos 15 segundos (muda a cada 16s).
4. Testar também retrato muito estreito (efeito contain), notícias com horizontais continuam com pan, Chrome desktop mantém layout.
5. Splash HTML de 5s é provisório; testar agora, discutir splash nativa depois.

## Claude
Trabalho isolado na branch `feature/ajustes-hero-mobile-versao-20261020`. Claude possui commits locais e stash; antes de sincronizar: `git status`, `git fetch`, integrar somente mudanças necessárias (sem reset/force), não fazer push/deploy duplicado. Atualizações do app v.00.03 por cima da v.00.02 continuam em homologação até aprovação dos gestos de Voltar, galeria e diálogo de saída.
