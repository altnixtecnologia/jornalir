# Jornal IR — Central de Audiência simples, no Editorial

Data: 23/11/2026. Fonte: roadmap aprovado em 15/11/2026 (Fase 4), antecipado por pedido explícito do proprietário.
Repositório oficial: altnixtecnologia/jornalir, sem sistema paralelo.

## O que foi programado
- Acesso: Editorial > Audiência do portal, ao lado de Matérias; atalho na própria lista de matérias.
- Dashboard responsivo e enxuto: hoje, ontem, 7 dias, 30 dias, mês atual; visualizações de páginas, usuários ativos, sessões; movimento diário; oito maiores horários; cidades/regiões; 12 notícias mais vistas com link público.
- Dados **exclusivamente reais** via Google Analytics Data API v1beta (batchRunReports), nenhum contador por IP, SQL paralelo, números estimados ou métricas falsas.
- Dashboard disponível somente a equipe autenticada, ativa, com visibilidade do módulo Editorial; tokens e chaves somente no servidor.
- Consulta em lote, timeout e cache em memória por 5 minutos (não assume cache global compartilhado entre funções); mensagem de indisponibilidade sem divulgar detalhes.
- Rota: /sistema/editorial/audiencia, sem alterar publicação, editorias, cadastro ou banco.

## O que falta para aparecerem números reais
- Não havia variáveis de GA4 nas Vercel dos projetos jornalir e jornalir-sistema no inventário de 23/11.
- Criar/identificar uma propriedade Google Analytics 4 que monitore o portal www.informativoregional.net.
- Ativar a **Google Analytics Data API** no Google Cloud do serviço, conceder **Visualizador** à conta de serviço na propriedade GA4.
- Variáveis de produção no projeto **jornalir-sistema**:
  - GA4_PROPERTY_ID: ID numérico da propriedade.
  - GA4_CLIENT_EMAIL: e-mail da conta de serviço Google Cloud.
  - GA4_PRIVATE_KEY: chave PEM privada da conta de serviço (segredo; inserir diretamente na Vercel, jamais no repo ou chat).
- Conferir fuso horário da propriedade como America/Sao_Paulo para manter pico horário e limites dos dias coerentes.
- A leitura não exige armazenar dados pessoais de leitores no Supabase.

## Coleta no portal — exigência anterior de privacidade
- A página de relatório **não instala pixels nem cookies** no portal.
- O portal atual não tem instrumentação GA4 controlada por variável no repositório nem sistema de consentimento para cookies analíticos.
- A política LGPD atual (docs/LGPD-POLITICA-PRIVACIDADE-RODAPE-20261020.md) diz expressamente para NÃO ativar rastreamento não essencial antes de implementar consentimento quando exigido. Preservar esta regra.
- Antes de começar coleta nova: implementar aviso de privacidade e consentimento com recusa/revogação, revisar informação aos leitores, configurar a tag GA4 somente após permissão e validar em produção.
- O GA4 não reconstrói visitas antigas coletadas por um rastreador que não estava presente.
- Se já existir uma propriedade que coletava tráfego por outro mecanismo externo, usar os dados existentes, sem duplicar a tag.

## Testes e publicação
- Testes de períodos, normalização, métricas separadas e caminhos seguros de matérias.
- TypeScript/build administrativos; sem aplicação de SQL, migração, alteração de produção ou anúncios.
- Futura homologação com credenciais reais e sessão editorial; conferir se a propriedade é exclusivamente do portal, se o fuso bate, e se há linhas geográficas omitidas por proteção de privacidade.
- Lembrete: o projeto jornalir-sistema estava com Ignored Build Step = exit 0 em 21/11/2026; merge no GitHub não garante deploy automático na Vercel.
