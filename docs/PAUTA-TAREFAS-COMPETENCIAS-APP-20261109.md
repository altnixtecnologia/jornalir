# PAUTA — TAREFAS POR PESSOA E APLICATIVO DOS COLABORADORES

**Regra editorial definida em 09/11/2026.** A Agenda e a Pauta são um fluxo único de cobertura, mas a presença no compromisso e as entregas da pauta não são a mesma coisa.

## Escala de equipe

- Uma pessoa aparece **uma única vez por evento**. Pode receber até 8 entregas independentes, sem duplicar o colaborador.
- Tarefas de catálogo: Fotografias, Vídeos, Entrevistas, Captação de áudio, Apuração de informações, Transmissão ao vivo, Seleção e envio de mídias.
- É permitido acrescentar tarefas **personalizadas**, descritas por evento, sem alterar o catálogo fixo.
- O sistema não escolhe automaticamente Fotos nem o redator. É necessário indicar responsável pela matéria (um só).
- O redator que não vai ao evento não precisa confirmar presença. A Agenda pode encerrar mesmo que a matéria ainda esteja pendente.

## Dar baixa, reabrir e transferir

- Cada entrega individual tem identificador, tipo, rótulo, responsável, data de atribuição, data de conclusão, usuário que concluiu e auditoria.
- Somente **o próprio escalado**, ou um gestor autorizado, pode dar baixa e reabrir uma entrega. Atribuições de terceiros não são editáveis por colaboradores comuns.
- O redator conclui a matéria independentemente das entregas de campo. O gestor pode intervir conforme as permissões existentes, com registro.
- A pauta só encerra quando a matéria e **todas** as entregas individuais estiverem concluídas.
- Ao adicionar uma entrega nova, o fechamento da Pauta é reaberto se necessário; entregas anteriores preservadas.
- Transferir campo para outra pessoa move as entregas associadas, inclusive o histórico de conclusão. A transferência continua dependendo de aceite, salvo exceção de gestor.
- Notificações e lembretes utilizam os responsáveis escalados, sem criar pessoas duplicadas.

## Fontes e integração

- Catálogo e validação de formulários: `apps/sistema/src/features/agenda/coverageTaskCatalog.ts`.
- Dados: `agendaTypes.ts`, `agendaData.ts`; UI de escala/baixa: `AgendaWorkspace.tsx`.
- Backend: migration `supabase/migrations/20261122310000_coverage_tasks_catalog_per_user.sql` cria `event_coverage_member_tasks` com RLS e ações restritas; preserva o modelo legado.
- A TV Pauta é **somente visualização**: permanece no mesmo endereço e passa a exibir as pendências por entrega.

## App dos colaboradores — próxima atualização (NÃO confundir com TV Pauta)

Ainda **não foi gerado nem publicado um APK dos colaboradores para estas novas baixas individuais**. A interface web de `/sistema/agenda` e `/sistema/pauta` pode ser usada pelo celular com autenticação existente após deploy.

Ao atualizar o app IR Controle, integrar às mesmas tarefas e permissões: mostrar somente entregas próprias (ou de gestor), botão "Dar baixa" para cada uma e opção de reabrir; registrar executor e horário; respeitar transferências; sincronizar notificações. **Nunca permitir que o aplicativo altere tarefas de outros colaboradores diretamente**, nem copiar credenciais administrativas, nem criar um sistema paralelo.

Não modificar o APK `com.jornalir.pautatv` da TV nem instalar nada sem autorização do proprietário.
