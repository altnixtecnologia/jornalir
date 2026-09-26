# Integração futura de cadastros — Altnix Informativo x JornalIR

## Objetivo
Evitar digitação duplicada quando a mesma pessoa ou empresa existir nos dois sistemas.

Exemplo real de uso: um cliente já cadastrado no Altnix Informativo precisa também existir no cadastro do JornalIR e, quando aplicável, participar da lista de aniversariantes. O operador deve poder localizar o cadastro existente e copiá-lo para o outro sistema.

## Regra principal
A integração será por **cópia explícita sob comando do operador**, não por sincronização automática contínua.

Cada sistema mantém:
- seu próprio banco;
- seu próprio UUID/ID primário;
- suas regras de negócio;
- seu histórico e auditoria.

Ao copiar, o sistema de destino cria um novo registro com o ID do próprio banco. O ID de origem deve ser guardado apenas como referência de integração, nunca usado como PK no destino.

## Fluxo desejado
1. No cadastro/lista de clientes, oferecer ação como **"Copiar para JornalIR"** ou **"Importar do Altnix Informativo"**.
2. Buscar o cadastro no sistema de origem.
3. Antes de criar, procurar duplicidade no destino por CPF/CNPJ e, como apoio, telefone/e-mail.
4. Mostrar uma prévia dos dados que serão copiados.
5. Confirmado pelo operador, criar o registro no banco de destino.
6. Salvar vínculo de origem/destino para auditoria e para evitar cópias duplicadas.

## Dados comuns a copiar quando existirem
- nome / razão social;
- nome fantasia;
- CPF/CNPJ;
- telefone;
- e-mail;
- CEP;
- rua;
- número;
- complemento;
- cidade;
- UF/região;
- segmento;
- outros campos comuns que existirem nos dois cadastros.

Campos exclusivos continuam sendo preenchidos apenas no sistema correspondente.

## Aniversariantes
O JornalIR pode usar o cadastro copiado como base para sua lista de aniversariantes. Se a data de nascimento não existir no Altnix Informativo, ela deve ser complementada no JornalIR sem impedir a cópia dos demais dados.

## Estrutura técnica sugerida
Preferência por integração servidor-a-servidor autenticada, com endpoint específico e escopo mínimo, em vez de liberar acesso direto de um front-end ao banco do outro sistema.

Sugestão de referência no destino:
- `source_system`: `altnix_informativo` ou `jornalir`;
- `source_record_id`: UUID do registro de origem;
- `imported_at`;
- opcionalmente `last_copied_at`.

Uma tabela de mapeamento separada também é aceitável e pode ser preferível para não contaminar a tabela principal.

## Fora de escopo por enquanto
- sincronização automática em tempo real;
- sobrescrever automaticamente dados já alterados no destino;
- compartilhar o mesmo UUID entre os dois bancos;
- excluir em cascata um cadastro no outro sistema.

## Status
**ANOTADO / NÃO IMPLEMENTADO.**

Implementar quando o cadastro/CRM e a rotina de aniversariantes do JornalIR entrarem na fase de integração.
