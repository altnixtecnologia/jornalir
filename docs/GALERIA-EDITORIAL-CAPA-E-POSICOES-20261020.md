# Jornal IR — melhoria da galeria de imagens de matéria (20/10/2026)

## Problema
O usuário carregou 33 fotos; sua capa favorita ficou numa das últimas posições, e HTML5 drag-and-drop exigia soltá-la exatamente na metade superior/inferior de cada cartão. Frustrante em listas longas e no mobile. A capa atual ficava no início e precisava ser deslocada manualmente.

## Solução implementada (somente no editor do sistema)
- **Tornar capa**: botão ☆ junto à legenda "Galeria · posição N". Ao clicar na foto 33, ela vira capa imediatamente, sem arrastar. A capa anterior vira primeira imagem da galeria; nenhuma foto desaparece.
- **Mover para**: seletor de posição em cada linha, com "Imagem principal (capa)" ou "Galeria · posição 1..N". Qualquer foto pode ir de 33 para 2 diretamente; o editor renumera as demais automaticamente.
- **Arrastar com indicador**: mantém handle `⋮⋮` e bordas destacadas antes/depois do alvo. Não depende mais do arrastar para grandes mudanças.
- `setCoverMedia` preserva legenda e crédito próprios da imagem promovida, além da galeria antiga; `moveArticleMediaToPosition` preserva os metadados de cada vínculo e garante exatamente uma capa, galeria sequencial.
- Upload, crop de foto, crédito e legenda, acervo, exclusão e persistência da matéria continuam os mesmos. O usuário deve **Salvar a matéria** para persistir a nova ordem; na edição nova, manter rascunho sem publicar.
- Nenhuma migration ou mudança de banco/API; apenas estado de interface já persistido em `ArticleMedia[]`.
- Não alterar notificações, Asaas, R2, site público ou APK.

## Testes a realizar antes de publicar produção
- 33 fotos: galeria 32 → capa em 1 clique; confirmar antiga capa como galeria 1, resto sem duplicados.
- Mover de Galeria 30 → Galeria 2 pelo seletor; fazer ida/volta e salvar/reabrir, confirmar ordem.
- Trocar capa preservando legenda e crédito; abrir editor de imagem e verificar slot correto.
- Drag and drop confirma linha-alvo na borda correta, sem precisar acertar área estreita.
- Conferir mobile e desktop; testar formulário com capa, sem capa, 1 e 33 fotos.
- Repositório no Windows: Claude deve `git status` e `git fetch` antes de integrar, preservando mudanças locais; nenhum reset/force-push. Não reaplicar migrações antigas.

## Validação realizada
- Build preview 1 `dpl_FwLyydEDtsvfkxMEBca771QGx1kY`: compilou código mas parou em types porque `ImportCandidateReview.tsx` também usa o picker compartilhado. **Não publicado**.
- Correção incluída para `ImportCandidateReview.tsx` (também passa `onMoveToPosition` usando o helper novo).
- Build preview 2 `dpl_2DfxEPx8vMCCJ4FvVE5mgTW7jthu`: **READY** no SHA `8cb77dc4b4ab0657cebb584af7c5dd71625e3fa3`; compilação Next.js e TypeScript passaram. Preview protegido: `https://jornalir-sistema-joijvxkg4-cristians-projects-34074cc3.vercel.app`.
- **Não houve publicação em produção do sistema nem mudanças no banco**. O site público permanece na implantação anterior `feature/notificacoes-ambiente-android-20261019`, independente desta alteração.
- **Ainda falta teste humano das interações** em uma matéria com 33 fotos reais, salvar e reabrir; o build READY não prova comportamento visual ou persistência ao salvar.
- Após homologação, publicar o sistema em um lote controlado e registrar o SHA. Claude Code pode fazer fetch desta branch (checar `git status` primeiro; não reset/force).
