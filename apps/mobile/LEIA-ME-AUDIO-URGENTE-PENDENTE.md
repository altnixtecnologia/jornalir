# Áudio do canal urgente — PENDENTE (19/10/2026)

O arquivo `jornal_ir_urgente.ogg` **não está presente** em
`android/app/src/main/res/raw/` (esta nota fica aqui no nível de
`apps/mobile/`, não dentro de `res/raw/`, porque qualquer arquivo com
nome fora do padrão de recurso Android ali dentro quebra a compilação).
Conferido na sincronização do dia 19/10/2026 — ausente também no GitHub
(a origem, um áudio preparado pelo ChatGPT, não chegou a ser versionada;
o resultado foi disponibilizado só como artefato para o usuário copiar
manualmente, segundo `docs/JORNAL-IR-PUSH-NATIVO-ANDROID-V0002-20261019.md`).

**Especificação esperada do arquivo que falta:**
- Caminho: `apps/mobile/android/app/src/main/res/raw/jornal_ir_urgente.ogg`
- Formato: Vorbis (.ogg), mono, 44,1 kHz
- Duração: 3,792 s · Tamanho: 33.056 bytes
- SHA-256: `81b4fa057e1172023170e2205011bef8b75b416726bf4fee8d2ab78dfd34ce99`

**Não foi substituído por nenhum outro áudio.** O código em
`JornalIrApplication.java` resolve o som do canal urgente pelo NOME do
recurso (`getIdentifier`), não por uma constante `R.raw.*` gerada em
tempo de compilação — por isso o projeto compila normalmente mesmo sem
este arquivo. Enquanto ele não existir, o canal `jornal_ir_urgente_v1` é
criado com o som padrão de notificação do Android (nunca mudo, nunca
quebra o build).

**Assim que o arquivo real for copiado para esta pasta com o SHA-256
acima, nenhuma mudança de código é necessária** — mas é preciso gerar um
novo APK (ver nota sobre canais imutáveis abaixo).

**Atenção — canais são imutáveis:** se este app já tiver sido instalado
em algum aparelho de teste ANTES do áudio ser adicionado, o canal
`jornal_ir_urgente_v1` já foi criado naquele aparelho com o som padrão —
adicionar o arquivo depois e reinstalar o mesmo APK **não muda o som**
nesse aparelho (o Android nunca atualiza som/importância de um canal já
criado). Nesse caso é necessário desinstalar o app daquele aparelho
antes de testar de novo, ou usar um `CHANNEL_URGENT_ID` com sufixo novo
(`_v2`) na próxima versão.
