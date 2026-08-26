-- Keep the round-three suspicion target sealed during the blind objection window.
-- The initial migration contains the corrected definition for fresh projects;
-- this migration safely patches projects that already applied it.
do $migration$
declare
  definition text;
  unsafe_fragment constant text := $fragment$'pendingTarget', o.pending_target$fragment$;
  safe_fragment constant text := $fragment$'pendingTarget', case when g.checkpoint_kind = 'awaiting_objection_question' then o.pending_target else null end$fragment$;
begin
  select pg_catalog.pg_get_functiondef('private.public_projection(uuid)'::regprocedure)
  into definition;

  if pg_catalog.strpos(definition, safe_fragment) > 0 then
    return;
  end if;

  if pg_catalog.strpos(definition, unsafe_fragment) = 0 then
    raise exception 'public_projection definition did not contain the expected objection fragment';
  end if;

  definition := pg_catalog.replace(definition, unsafe_fragment, safe_fragment);
  execute definition;
end;
$migration$;
