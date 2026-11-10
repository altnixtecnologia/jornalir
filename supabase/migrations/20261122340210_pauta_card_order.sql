-- Pauta: ordenar TODOS os cards de uma semana via arrastar e soltar.
-- Usa sort_order já existente; a Pauta TV já consome esse mesmo campo.
-- Manter ordenação antiga ao inicializar, evitar alertas falsos por alteração visual.

-- Atualização apenas de ordenação não representa nova pauta/compromisso:
-- não enfileirar push administrativo por arrastar um cartão.
CREATE OR REPLACE FUNCTION public.queue_staff_agenda_notify()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_event_id uuid; v_row record;
begin
  -- Arrastar o cartão muda só a ordem, não é novo compromisso/aviso.
  if TG_TABLE_NAME='weekly_pauta_items' and TG_OP='UPDATE' and
     (to_jsonb(new)-'sort_order'-'updated_at'-'updated_by') =
     (to_jsonb(old)-'sort_order'-'updated_at'-'updated_by') then
    return new;
  end if;
  if TG_OP = 'DELETE' then v_row := old; else v_row := new; end if;
  -- Evitar CASE com campo de record de outra tabela.
  if TG_TABLE_NAME = 'agenda_events' then v_event_id := v_row.id;
  elsif TG_TABLE_NAME = 'weekly_pauta_items' then v_event_id := v_row.agenda_event_id;
  elsif TG_TABLE_NAME = 'agenda_event_assignees' then v_event_id := v_row.event_id;
  end if;
  if v_event_id is null then return coalesce(new, old); end if;
  insert into public.staff_agenda_notify_outbox (agenda_event_id)
  values (v_event_id)
  on conflict (agenda_event_id) where status in ('queued','processing') do nothing;
  return coalesce(new, old);
end $function$;

-- A ordem antiga era status -> prazo -> sort_order -> criação.
-- Só 14 pautas ativas no momento deste fechamento: preservar ordem visual.
WITH original AS (
 SELECT id, row_number() OVER (
  PARTITION BY week_start ORDER BY status DESC,
   due_date ASC NULLS LAST,due_time ASC NULLS LAST,
   sort_order ASC,created_at ASC,id ASC
 )::int * 10 AS position
 FROM public.weekly_pauta_items WHERE status<>'cancelled'
)
UPDATE public.weekly_pauta_items p SET sort_order=o.position FROM original o
WHERE p.id=o.id AND p.sort_order IS DISTINCT FROM o.position;

-- Novas matérias, além das movidas de outra semana, entram no final.
CREATE OR REPLACE FUNCTION public.assign_pauta_sort_order()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
DECLARE highest integer;
BEGIN
 IF TG_OP='INSERT' OR new.week_start IS DISTINCT FROM old.week_start THEN
  PERFORM pg_advisory_xact_lock(7441,hashtext(new.week_start::text));
  SELECT max(p.sort_order) INTO highest FROM public.weekly_pauta_items p
   WHERE p.week_start=new.week_start AND p.status<>'cancelled'
     AND p.id IS DISTINCT FROM new.id;
  new.sort_order:=coalesce(highest,0)+10;
 END IF;
 RETURN new;
END;$function$;
DROP TRIGGER IF EXISTS weekly_pauta_assign_sort_order ON public.weekly_pauta_items;
CREATE TRIGGER weekly_pauta_assign_sort_order
 BEFORE INSERT OR UPDATE OF week_start ON public.weekly_pauta_items
 FOR EACH ROW EXECUTE FUNCTION public.assign_pauta_sort_order();

-- Atualização atômica. Compara a ordem que o usuário viu com a ordem atual
-- para que duas pessoas não sobrescrevam silenciosamente o trabalho da outra.
CREATE OR REPLACE FUNCTION public.reorder_pauta_cards(
 p_week_start date,p_expected_ids uuid[],p_ordered_ids uuid[]
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE current_ids uuid[];n int;
BEGIN
 IF NOT public.is_agenda_manager() THEN
  RAISE EXCEPTION 'Sem permissão para organizar a Pauta' USING errcode='42501';
 END IF;
 IF p_week_start IS NULL OR p_week_start<>public.pauta_week_start(p_week_start) THEN
  RAISE EXCEPTION 'Semana de Pauta inválida';
 END IF;
 n:=cardinality(p_ordered_ids);
 IF p_ordered_ids IS NULL OR p_expected_ids IS NULL OR
    n<2 OR n>200 OR n<>cardinality(p_expected_ids) OR
    (SELECT count(DISTINCT item.id) FROM unnest(p_ordered_ids) AS item(id))<>n OR
    (SELECT count(DISTINCT item.id) FROM unnest(p_expected_ids) AS item(id))<>n OR
    array_position(p_ordered_ids,NULL) IS NOT NULL OR
    array_position(p_expected_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Seleção de pautas inválida ou incompleta';
 END IF;
 PERFORM pg_advisory_xact_lock(7441,hashtext(p_week_start::text));
 -- Trava cartões da semana contra atualizações/transferências concorrentes.
 PERFORM 1 FROM public.weekly_pauta_items p
 WHERE p.week_start=p_week_start AND p.status<>'cancelled' FOR UPDATE;
 SELECT coalesce(array_agg(p.id ORDER BY p.sort_order,p.created_at,p.id),'{}'::uuid[])
 INTO current_ids
 FROM public.weekly_pauta_items p
 WHERE p.week_start=p_week_start AND p.status<>'cancelled';
 IF current_ids IS DISTINCT FROM p_expected_ids THEN
  RAISE EXCEPTION 'A ordem da Pauta mudou em outra sessão. Atualize a página antes de mover novamente';
 END IF;
 IF NOT(current_ids @> p_ordered_ids AND p_ordered_ids @> current_ids) THEN
  RAISE EXCEPTION 'Todos os cartões desta semana devem permanecer na organização';
 END IF;
 WITH ranking AS(
  SELECT id,position::integer*10 AS new_position
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS row(id,position)
 )
 UPDATE public.weekly_pauta_items p SET sort_order=ranking.new_position
 FROM ranking WHERE p.id=ranking.id AND p.week_start=p_week_start
  AND p.status<>'cancelled' AND p.sort_order IS DISTINCT FROM ranking.new_position;
 RETURN true;
END;$function$;
REVOKE ALL ON FUNCTION public.reorder_pauta_cards(date,uuid[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reorder_pauta_cards(date,uuid[],uuid[]) TO authenticated;

COMMENT ON FUNCTION public.reorder_pauta_cards(date,uuid[],uuid[]) IS
'Ordenação compartilhada da Pauta semanal para administração e Pauta TV. Recusa lista incompleta, repetida, filtro e gravação concorrente.';
