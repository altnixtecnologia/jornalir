# Jornal IR — visualizador de fotos fullscreen com zoom (20/10/2026)

## Problema observado no APK v.00.02
- Galeria de leitura não fazia pinch-to-zoom ou duplo toque.
- Ao girar o Android, imagem continuava limitada em modal pequeno.
- CSS antigo tinha padding grande e max-height 78vh; lightbox ficava dentro do conteúdo da matéria.
- Matéria com foto de capa única não montava o lightbox.

## Código preparado
- apps/site/src/components/site/ArticleGallery.tsx: lightbox via React Portal no document.body, preenchendo 100vw × 100dvh; pinch com 2 dedos, deslocamento com 1 dedo quando ampliado, duplo toque para zoom 2.5x / 1x, zoom +/- no desktop, swipe horizontal entre fotos sem zoom, seta esquerda/direita e ESC; bloqueio de scroll de fundo e devolução de foco ao fechar.
- Limite de zoom 1x a 5x, com pan limitado às bordas visíveis da imagem real (object-fit:contain). Reset ao mudar de foto; resize e orientação clampeiam a posição para não mostrar áreas vazias.
- Contador, legendas/créditos, fundo escuro, controles com safe-area, pré-carregamento apenas da próxima e anterior (nunca todas as fotos).
- apps/site/src/app/globals.css: remover max-height/padding antigos; modal em viewport total, respeitar barras e landscape.
- apps/site/src/components/site/ArticleMediaViewer.tsx: montar lightbox mesmo se só houver a capa.

## Segurança do deploy
- Modificações somente no site público; sem APK novo, migrações, alteração de notificações Firebase, banco ou sistema administrativo.
- Preservar políticas LGPD e footer já publicados.
- Necessário QA Android real com 1, 2 e 33 fotos, portrait/landscape, pinça/pan, duplo toque, swipe 1x, não navegar enquanto com zoom, legenda, ESC desktop, rotação e teste em telas pequenas. Build Vercel é verificação de código, não substitui teste físico.
- Para Claude Code local: primeiro git status, git fetch, integrar branch sem reset e sem force; manter main e trabalhos locais sem perda.
