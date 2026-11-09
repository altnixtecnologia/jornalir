# PROMPT PARA CLAUDE CODE — APK DA PAUTA TV / JORNAL IR

**Leia esta tarefa inteira. Primeiro sincronize o VS Code local de forma segura.** Não comece a programar antes de confirmar que o código da branch indicada está presente localmente. O script do repositório faz isso:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\preparar-claude-pauta-tv.ps1 -OpenVSCode
```

**Se o checkout local ainda não tiver o PS1**, execute no terminal PowerShell do VS Code, já na raiz do repositório, este bootstrap não destrutivo (obtém o PS1 diretamente do GitHub via Git, sem trocar de branch antes da checagem de segurança):

```powershell
git fetch origin
$TmpPs1 = Join-Path $env:TEMP 'preparar-claude-pauta-tv.ps1'
git show origin/solicitacoes-financeiro-contratos-irc-20261031:scripts/preparar-claude-pauta-tv.ps1 | Set-Content -LiteralPath $TmpPs1 -Encoding UTF8
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível obter o PS1 do GitHub.' }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $TmpPs1 -RepositoryRoot (Get-Location).Path -OpenVSCode
```

Antes de executar qualquer script obtido remotamente, confirme que `git remote get-url origin` aponta para `altnixtecnologia/jornalir` e leia seu conteúdo. O próprio script também confere isso antes de sincronizar. Caso encontre alterações locais ou worktree ocupada, ele interrompe sem apagar nada.

Se o script for executado pela própria Claude, não é necessário iniciar outra sessão Claude. Não use `-StartClaude` dentro de uma sessão Claude.

## Contexto já pronto no GitHub

- Repo: `altnixtecnologia/jornalir`
- Branch de integração: `solicitacoes-financeiro-contratos-irc-20261031`
- A PR #27 integrou **a página TV e o fluxo Agenda/Pauta**.
- Documento técnico obrigatório: `docs/PAUTA-TV-APK-HANDOFF-20261109.md`.
- Página web da TV: **https://controle.altnix.com.br/tv/pauta**.
- Os dados são do Sistema IR, com autenticação, autorização, RLS, equipe de cobertura, responsabilidades e atualização automática. **Não recriar as funcionalidades web e não duplicar banco.**
- Esta instrução é para produzir **o APK Android** da TV vertical, não para reimplementar o Sistema IR.

## Passo 1 — sincronização, sem perder trabalho

1. Localize o monorepo aberto no VS Code e confira `git remote -v`, `git status --short`, `git branch --show-current` e `git worktree list`.
2. Rode `scripts/preparar-claude-pauta-tv.ps1`. Ele valida `origin`, recusa árvore suja, faz `git fetch`, abre a branch de integração se possível e aplica **somente** `git merge --ff-only origin/solicitacoes-financeiro-contratos-irc-20261031`.
3. Se houver alterações locais, stash, worktree contendo a branch, conflitos, divergiu o histórico ou a branch não estiver acessível, **pare e reporte**. Não execute `reset --hard`, `clean -fd`, `rebase`, `push --force`, exclusão de stashes ou worktrees.
4. Confirme que os arquivos `apps/sistema/src/app/tv/pauta/page.tsx`, `apps/sistema/src/features/pauta-tv/PautaTvBoard.tsx`, `supabase/migrations/20261122290000_coverage_team_agenda_pauta.sql` existem. A versão web está **publicada**: deploy `dpl_CctBHZW5AXwzReNu5e7QYSo6RyYH`, commit de aplicação `4693a16bdff0fee7a4cb0480c30bbba8ded8cfdd`, status `READY`, migration registrada no Supabase. A sessão de visualização da TV ainda precisa ser testada com login real; não inventar sucesso de testes não realizados.

## Passo 2 — aplicativo Android exclusivo

Desenvolva um **aplicativo Android simples para TV Box**, separado de `com.jornalir` (app público), `com.jornalir.controle` (app da equipe) e do player LED. Use um `applicationId` próprio e estável, por exemplo `com.jornalir.pautatv`. Coloque o fonte isolado em `apps/pauta-tv-android/` ou escolha um diretório equivalente **sem mexer no aplicativo do LED nem nos projetos de terceiros**.

### Comportamento obrigatório

- WebView HTTPS abre exatamente `https://controle.altnix.com.br/tv/pauta`, preservando os parâmetros de data e a sessão autenticada do usuário.
- Tela **vertical (portrait 9:16)** em modo imersivo, sem barra de navegação quando estiver exibindo o quadro de fechamento, com opção de sair acessível ao administrador.
- Compatível com TV Box Android e controle remoto; navegação de login possível sem toque; foco de teclado apropriado.
- Não inclua usuário, senha, token, cookies, `service_role`, chave de administração ou segredo no APK.
- Cookies do WebView, JavaScript e armazenamento necessários ao Supabase Auth somente para o domínio oficial; permitir HTTPS, bloquear tráfego cleartext e restringir navegação externa.
- Retomar a página após interrupção, reabrir após falha de conexão e oferecer estado de reconexão visual; sem looping agressivo.
- Prevenir suspensão durante exibição quando configurado, sem impedir saída controlada.
- Não adicionar atualização fictícia: a página web já usa Supabase Realtime e fallback a cada 60s, e rotaciona grupos de pautas quando houver muitas.
- Quando for necessário reiniciar, preservar apenas preferências não sensíveis; não registrar sessão, tokens nem dados privados em logs.
- Bloquear navegação não autorizada fora do domínio e tratar erros de certificado de modo seguro (nunca ignorar erros SSL).
- Tela opcional de configuração protegida para URL fixa, orientação, início automático e limpeza de sessão.
- Verificar a saída vertical mesmo que o HDMI anuncie 1920x1080 na horizontal. Não esticar conteúdo nem distorcer letras.

### Escopo de testes

- Compilar e validar `assembleDebug` e indicar o caminho exato do APK. Caso seja possível e autorizado, gerar também APK assinado **somente com chaves do proprietário**, nunca invente uma assinatura de produção.
- Testar em emulador ou dispositivo de homologação autorizado: 4, 6, 10, 20 pautas; uma única pauta; lista vazia; títulos longos; alternância automática; sem scroll; Internet offline/online; sessão expirada; mudança de status via outro navegador; rotação/orientação.
- Não instalar automaticamente em TV Boxes ou aparelhos reais sem autorização. Não alterar o banco Supabase, configuração da Vercel, domínio ou cron.
- Não sobrescrever projetos Android existentes. Não copiar APIs privadas, tokens ou configurações `.env` para o APK.
- Ao terminar, apresentar um resumo objetivo: versão `versionName`/`versionCode`, package, compatibilidade mínima Android, tamanho, SHA-256 do APK, caminhos do código e saída, testes realizados e pendências.
- Fazer alterações locais versionadas e informar os commits. Solicite autorização antes de push/deploy/instalação caso ainda não tenham sido explicitamente autorizados nesta sessão.
- Ao ocorrer erro, diagnosticar e corrigir; não silenciar erros e não afirmar que o APK foi criado se não houver arquivo real.

## Referências e prioridade

Leia `docs/PAUTA-TV-APK-HANDOFF-20261109.md` **antes** da implementação. 
A prioridade é um APK estável e enxuto que mostre o Modo TV pronto, não novos módulos. Não modifique funcionalidades da Agenda, da Pauta ou do portal público por conveniência.

**Critério de aceite:** instalar em uma TV Box de homologação autorizada, autenticar, mostrar a TV vertical ocupando a tela, e acompanhar a evolução das matérias em tempo real sem interação. O usuário decidirá quando instalar/publicar o APK final.
