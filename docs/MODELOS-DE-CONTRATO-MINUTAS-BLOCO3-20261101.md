# Bloco 3 — Modelos de contrato: minutas reais, seleção automática e assinador (01/11/2026)

**STATUS: MINUTAS PREPARADAS, NENHUMA APROVADA JURIDICAMENTE NEM ATIVA.** As 6 minutas pedidas foram escritas e verificadas contra o código real de validação do sistema (não só por leitura manual), mas estão como `active = false` na migration preparada (**não aplicada** remotamente): `supabase/migrations/20261101100000_contract_templates_seed_minutas.sql`. Nenhum dado fiscal real (CNPJ da Informativo Regional, por exemplo), valor ou condição comercial foi inventado — esses campos ficam como variáveis a preencher por documento emitido (`custom_values`), nunca gravados aqui.

## 1. Categorias e variáveis — o que o sistema REALMENTE aceita (não as 4 "sugeridas")

A investigação encontrou que existem **dois mecanismos de merge de placeholder completamente diferentes** no sistema, cada um com seu próprio vocabulário — usar o errado faria a minuta parecer certa visualmente mas nunca ser selecionada/emitida pelo pipeline real:

### Mecanismo A — Contratos institucionais (`contracts`, mais antigo)
Usado só quando alguém cria manualmente um registro em `/sistema/financeiro/contratos` ligado ao cliente. Placeholders: os 12 campos de `CONTRACT_TEMPLATE_AUTO_FIELDS` (`@ir/types`) — `cliente.nome`, `cliente.cpf_cnpj`, `cliente.endereco`, `cliente.representante`, `cliente.contato`, `contrato.numero`, `contrato.referencia`, `contrato.objeto`, `contrato.valor`, `contrato.vigencia_inicio`, `contrato.vigencia_fim`, `data.hoje`. **Sem seleção automática de modelo** — categoria é só texto livre organizacional.

### Mecanismo B — Vendas comerciais (`commercial_sales`/`commercial_contract_packages`, Nov/2026)
Pipeline **completo e já construído** (não nesta sessão) para publicidade/locação/pacotes, com:
- **Seleção automática real** (`assign_commercial_contract_default_templates`, `supabase/migrations/20261110100000`): escolhe o modelo comparando a categoria do modelo ativo mais recente com `"commercial_" || canal_do_serviço` (quando o pacote é "separado", um documento por serviço) ou com `"commercial_combined"` (quando o pacote é "combinado", um único documento pra venda inteira). `commercial_generic` só é usado como último recurso, e só no modo separado.
- **Canais reais** (de `commercial_products.channel`/`commercial_contract_services.service_channel`, confirmados no código, não inventados): `newspaper`, `website`, `social_media`, `led_panel`, `equipment_rental`, `package`, `other`.
- **Placeholders**: `cliente.qualificacao` (ou `cliente.nome`+`cliente.documento`+`cliente.endereco` juntos), `cliente.representante`, `cliente.representante_cpf`, `venda.referencia`, `venda.valor`, `servicos.resumo` (anexo auto-gerado com objeto/vigência/local/valor de cada serviço — nunca precisa ser escrito à mão no modelo). **Mais 4 campos obrigatórios da CONTRATADA** que o modelo precisa declarar em `variables` E usar no texto: `contratada.razao_social`, `contratada.cnpj`, `contratada.endereco`, `contratada.representante` (`missingCommercialLegalParties`, `apps/sistema/src/lib/contracts/commercialPartyRequirements.ts`) — preenchidos manualmente por documento (`custom_values`), o sistema não tem um "perfil da empresa" fixo pra isso.

**Achado crítico corrigido nesta sessão**: a regex de validação de chave de variável (`packages/core/src/financeiro/contract-template-service.ts`) era `/^[a-z][a-z0-9_]{1,59}$/` — **sem ponto**. Isso tornava **impossível** declarar `contratada.razao_social` etc. pela tela de cadastro, então **nenhum modelo comercial jamais teria passado da validação** desde que esse pipeline foi construído (a tabela está vazia — "0 modelos cadastrados" — então ninguém tinha notado ainda). Corrigida para aceitar exatamente um `prefixo.sufixo` (nunca mais de um ponto, nunca ponto nas pontas) — 2 testes novos em `packages/core/test/contract-template.test.ts` cobrindo a aceitação do padrão real E a rejeição de variações malformadas.

## 2. As 6 minutas e suas categorias reais

| # | Modalidade pedida | Categoria real usada | Mecanismo |
|---|---|---|---|
| 1 | Assinatura anual do jornal impresso | `assinaturas` | A (sem seleção automática — ver pendência abaixo) |
| 2 | Publicidade no jornal impresso | `commercial_newspaper` | B (seleção automática real) |
| 3 | Publicidade digital | `commercial_website` | B — canal `social_media` ficaria como modelo futuro análogo, não criado por falta de pedido confirmado |
| 4 | Publicidade em painel LED | `commercial_led_panel` | B |
| 5 | Locação de equipamentos | `commercial_equipment_rental` | B |
| 6 | Contratação combinada de vários serviços | `commercial_combined` | B (documento único, `document_mode='combined'`) |

Todas as 6 foram verificadas automaticamente (não só lidas) contra o código real — `apps/sistema/test/contract-templates-seed-minutas.test.ts`, 4 testes novos que leem a migration de verdade e chamam `missingCommercialLegalParties`/`ContractTemplateService.create` de produção: nenhuma chave de variável incompatível, nenhum placeholder usado sem estar declarado (ou sem ser um auto-field conhecido), nenhuma variável declarada e nunca usada, e as 5 comerciais passam a exigência de qualificação da contratada.

## 3. Seleção automática — verificada, não construída nesta sessão

O pipeline já cumpre o pedido do Bloco 3, item 2, sem necessidade de código novo:
- Identifica a modalidade pelo canal real do serviço vendido (não inventa).
- Pacotes mistos: `document_mode` ('combined'/'separate') já decide entre documento único ou documentos separados, reaproveitando a estrutura existente.
- Valores individuais vêm de `source_snapshot.totalAmount` (snapshot imutável da venda/proposta original) — **nunca calculados dividindo o total** (`commercialDocumentAmount.ts` lança erro se o valor do item não existir, em vez de ratear).
- Datas de início/término por serviço: colunas `starts_on`/`ends_on`, obrigatórias antes de avançar pra revisão jurídica.
- Vínculo com cadastro único: `commercial_contract_packages.client_id` = `commercial_sales.client_id`, nunca um cliente paralelo.
- Histórico/versionamento: `commercial_contract_documents` guarda `template_id`+`template_version`+`sha256` por documento emitido, nunca sobrescreve; reemitir é seguro (ignora o que já foi emitido com a mesma versão).
- Conferência humana antes da emissão: status `draft → pending_legal_review → legal_approved`, com justificativa textual obrigatória (20-1000 caracteres) de quem revisa — a aplicação nunca aprova por conta própria.

**Achado real, sem correção automática (decisão do usuário)**: este pipeline cobre só `commercial_sales` (publicidade/locação/pacotes). **Assinaturas (`subscriptions`) nunca passam por ele** — não há seleção automática de modelo pra assinatura nenhuma; o único caminho hoje é o Mecanismo A (Contrato institucional manual), que por sua vez não é criado automaticamente pela conversão de solicitação (achado já registrado no Bloco 1/2). Ficam dois caminhos de documento totalmente desconectados.

## 4. Assinador digital — achado importante: existem DOIS assinadores, nenhum criado nesta sessão

Ao verificar a integração pedida no item 3, a investigação encontrou que o sistema **já tem dois pipelines de assinatura eletrônica separados**, ambos anteriores a esta sessão:
- **Institucional** (`contract_signature_invitations`, 16/10/2026): ligado a `contracts`/documentos institucionais.
- **Comercial** (`commercial_signature_requests`/`commercial_signature_invitations`/`commercial_signature_participants`, 13/11/2026) — o próprio comentário da migration diz: *"Assinatura comercial separada do assinador institucional."* Tem seu próprio cadastro de signatários (`commercialSigners.ts`, 2 a 10 pessoas, papéis contratante/contratada/testemunha), convites com token hash, reenvio (`reissue_commercial_signature_invitation`), validação de identidade e aceite OTP, comprovante com hash, armazenamento privado — tudo reaproveitando o mesmo tipo de evidência/hash da família institucional, mas em tabelas próprias.

**Nenhum assinador novo foi criado nesta sessão** (instrução respeitada). O achado em si — dois pipelines paralelos em vez de um único — é uma decisão arquitetural de uma sessão anterior à minha, não um problema introduzido agora; fica documentado pra quando o usuário quiser decidir se unifica, ou se mantém os dois (publicidade/comercial com seu próprio fluxo, institucional com o seu). Os 11 testes já existentes desse pipeline comercial (`commercial-*.test.ts`, listados abaixo) continuam 100% passando depois da correção da regex.

## 5. Regras comerciais pendentes (Bloco 3, item 4) — nada alterado automaticamente

- **Ativação de assinatura**: regra preservada, sem nenhuma mudança nesta etapa (mesma pendência já registrada no Bloco 2 — ativa imediatamente, sem esperar pagamento/contrato).
- **Assinatura ativa ≠ contrato assinado/pagamento confirmado**: confirmado que o sistema não faz essa suposição em nenhum lugar verificado — `subscriptions.status` e os status de `commercial_signature_requests`/`contract_signature_invitations` são campos completamente independentes; nenhum trigger ou Server Action lidos nesta sessão infere um a partir do outro.
- **Rateio em pacotes mistos**: já garantido pelo próprio desenho do Mecanismo B (ver item 3 acima — nunca divide automaticamente, sempre usa o valor já negociado por item, lança erro se faltar). Não precisou de correção nova nesta etapa (diferente do Bloco 2, onde a falta dessa trava em `site_interest_requests` foi corrigida).

## 6. Pendências jurídicas e comerciais para decisão do proprietário

1. Revisão jurídica humana do texto das 6 minutas (nenhuma é um contrato válido; todas têm o aviso "MINUTA PARA REVISÃO JURÍDICA, NÃO É CONTRATO VÁLIDO" no corpo).
2. Unificar (ou não) os dois pipelines de assinatura eletrônica (achado da seção 4).
3. Ligar (ou não) a conversão de solicitação/assinatura a um documento contratual automático — hoje assinatura nunca gera documento nenhum sozinha (achado da seção 3).
4. Momento de ativação da assinatura vs. confirmação de pagamento/contrato (já registrado no Bloco 2, reafirmado aqui sem mudança).
5. Decidir se "Publicidade digital" deve virar dois modelos (`commercial_website` + `commercial_social_media`) em vez de um só.
6. Depois da revisão jurídica, alguém com acesso precisa ativar cada modelo (`set_contract_template_active`) — hoje qualquer funcionário ativo pode fazer esse toggle (não é restrito a admin/owner); fica registrado como observação, sem alteração, pois mudar essa permissão não foi pedido.
