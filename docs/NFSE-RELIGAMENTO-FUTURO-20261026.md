# NFS-e — como religar a transmissão real (guia técnico, 26/10/2026)

Este documento existe pra responder exatamente UMA pergunta, de forma que qualquer agente (ou pessoa) consiga religar a NFS-e sem precisar reconstruir a arquitetura: **onde estão os pontos de conexão reais, e o que precisa mudar em cada um pra sair do estado "bloqueado" para "transmitindo de verdade".**

Nada neste documento abre uma possibilidade de transmissão agora — é só o mapa de onde cada interruptor está.

## 1. As peças REAIS já existem e já estão testadas

| Peça | Arquivo | Status |
|---|---|---|
| Cliente REST (emissão, consulta por chave/DPS, eventos de cancelamento) | `packages/core/src/nfse/sefin-nacional-client.ts` (`SefinNacionalClient`) | Real, testado com `MockAgent` |
| Builder da DPS | `packages/core/src/nfse/dps-builder.ts` | Real, testado contra o XSD oficial |
| Builder do evento de cancelamento | `packages/core/src/nfse/event-builder.ts` | Real, testado contra o XSD oficial (com ressalva documentada — ver seção 4) |
| Assinatura XML (DPS e evento) | `packages/core/src/nfse/signature.ts` | Real, perfil oficial confirmado |
| Adaptador que liga o cliente real ao `TransmissionService` | `packages/core/src/nfse/national-nfse-provider.ts` (`SefinNacionalNationalNfseProvider`) | Real, testado ponta a ponta (`nfse-end-to-end-real-client.test.ts`) |
| Interface testável pro envio de eventos de cancelamento | `packages/core/src/nfse/cancellation-service.ts` (`CancellationEventProvider`) | Real — `SefinNacionalClient` já a satisfaz estruturalmente, sem adaptador |
| mTLS (dispatcher com certificado de cliente) | `packages/core/src/nfse/mutual-tls.ts` (`createMutualTlsDispatcher`) | Real |
| Certificado A1 (upload, PFX, cofre AES-256-GCM) | `certificate-service.ts`/`secret-store.ts`/`pfx-parser.ts` | Real |

Ou seja: **a parte difícil (protocolo HTTP, gzip+base64, parsing, assinatura XML, mTLS) já está pronta e testada.** O que falta é só **plugar** essas peças na composição real do app e **remover os bloqueios deliberados** — nunca reconstruir nada do zero.

## 2. Onde religar — emissão e consulta

Arquivo: `apps/sistema/src/composition/nfse.ts`, função `getTransmissionService`.

Hoje:
```ts
export function getTransmissionService(client: SupabaseClient): TransmissionService {
  return new TransmissionService(
    createDraftRepositorySupabase(client),
    createIssuerConfigRepositorySupabase(client),
    createDpsSequenceRepositorySupabase(client),
    createIssuedNoteRepositorySupabase(client),
    createTransmissionAttemptRepositorySupabase(client),
    new FetchNationalNfseProvider(),       // <- bloqueia tudo incondicionalmente
    getCertificateService(),
  );
}
```

Pra religar (NUNCA fazer isto sem autorização explícita e homologação completa):
1. Montar o dispatcher mTLS real: `createMutualTlsDispatcher({ certificatePem, privateKeyPem })` (`mutual-tls.ts`) com o certificado A1 real do prestador (já extraído/decifrado via `CertificateService.getActiveSigningMaterial`).
2. Instanciar `new SefinNacionalClient(dispatcher)` (`sefin-nacional-client.ts`).
3. Trocar `new FetchNationalNfseProvider()` por `new SefinNacionalNationalNfseProvider(client)` (`national-nfse-provider.ts`) — é um "drop-in replacement", já satisfaz a mesma interface `NationalNfseProvider`.
4. Remover (ou tornar condicional a `NFSE_AVAILABLE_IN_THIS_RELEASE`) o `environment = "homologation" as const` fixo em `transmission-service.ts` SE algum dia for necessário transmitir em produção real — hoje ele deve continuar fixo em homologação até a Produção Restrita estar homologada e aprovada.
5. Confirmar `NFSE_AVAILABLE_IN_THIS_RELEASE = true` (`releasePolicy.ts`) — sem isso, `checkModuleAction`/middleware/Server Actions continuam bloqueando tudo mesmo com o provider real plugado.

A consulta (`TransmissionService.consultNfseByAccessKey`/`consultDps`) usa o MESMO provider — nenhuma mudança adicional é necessária além do passo 3.

## 3. Onde religar — cancelamento

Arquivo: `apps/sistema/src/composition/nfse.ts`, função `getCancellationService`.

Hoje:
```ts
export function getCancellationService(client: SupabaseClient): CancellationService {
  return new CancellationService(
    createIssuedNoteRepositorySupabase(client),
    createCancellationRequestRepositorySupabase(client),
    // 3º parâmetro omitido -> usa o padrão BlockedCancellationEventProvider()
  );
}
```

Pra religar:
1. Passar o MESMO `SefinNacionalClient` real (passo 2 da seção 2) como 3º argumento — ele já satisfaz `CancellationEventProvider` estruturalmente, nenhum adaptador novo é necessário.
2. **Reescrever `CancellationService.submitCancellation()`** (hoje lança `CancellationSubmissionNotReadyError` incondicionalmente, ANTES de qualquer lógica) pra efetivamente: carregar a solicitação + a nota emitida + a config do emissor + o material de assinatura → montar o XML com `buildCancellationEventXml` (`event-builder.ts`) → assinar com `signCancellationEventXml` (`signature.ts`) → chamar `this.eventProvider.submitCancellationEvent(...)` → interpretar o resultado → atualizar o registro (`CancellationRequestRepository` hoje não tem método de update — precisa de um método novo, deliberadamente ainda não criado, pra nunca sobrescrever o histórico; a forma correta é inserir uma NOVA linha de resultado, nunca editar a `pending`).
3. Confirmar a composição do `Id` de `infPedReg` (ver seção 4) contra o Swagger autenticado antes de transmitir qualquer evento real — isso é o único ponto que genuinamente não pode ser resolvido sem acesso real.

## 4. Pendência que NINGUÉM pode resolver sem a SEFIN real

Documentada em detalhe no topo de `event-builder.ts`: a fórmula do atributo `Id` de `infPedReg` (`TSIdPedRegEvt`) está corroborada por 3 fontes independentes como `"PRE" + chave de acesso (50) + tipo do evento (6) = 59 caracteres`, mas o REGEX do XSD oficial vendorizado (`PRE[0-9]{8}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{33}`) só bate com essa fórmula quando o 9º caractere do resultado for literalmente `"1"` ou `"2"` — o que depende do conteúdo real da chave de acesso emitida pela própria SEFIN, fora do nosso controle. Isso é uma contradição confirmada entre a prosa do Manual de Integração oficial e o regex do XSD vigente (também relatada pelo changelog do projeto open-source `Quantum-Tecnology/nfse-nacional`), não um erro desta implementação.

**Não há solução de código pra isso.** Só é resolvível testando contra o validador real da SEFIN em Produção Restrita, com uma chave de acesso real — na hora da homologação supervisionada. Até lá, qualquer tentativa de "corrigir" isso no código seria inventar uma composição sem fonte oficial — exatamente o que este projeto se comprometeu a nunca fazer.

## 5. Checklist mínimo antes de religar de verdade

Isto NÃO substitui `docs/NFSE-FINALIZACAO-20261025.md` (critérios de aceite completos) — é um resumo rápido:

- [ ] Certificado A1 real do CNPJ prestador, configurado e validado (não um certificado de teste gerado localmente).
- [ ] Credenciais/homologação formal junto à SEFIN Nacional pra Produção Restrita.
- [ ] Religar seção 2 (emissão/consulta) E seção 3 (cancelamento) na composição real.
- [ ] Resolver a pendência da seção 4 contra o Swagger autenticado real.
- [ ] `NFSE_AVAILABLE_IN_THIS_RELEASE = true` só depois de TUDO acima, nunca antes.
- [ ] Emissão supervisionada de teste em Produção Restrita, revisão humana do primeiro resultado real.
- [ ] Só depois disso, revisar separadamente o que falta pra Produção real (ver limitação sobre o pacote XSD de Produção Restrita vs. Produção, documentada em `xsd-validator.ts`).
