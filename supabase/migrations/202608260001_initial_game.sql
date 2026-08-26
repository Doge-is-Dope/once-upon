create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
create schema if not exists api;

revoke all on schema private from public, anon, authenticated;
revoke all on schema api from public, anon;
grant usage on schema api to authenticated;

create table private.games (
  id uuid primary key default extensions.gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-Z0-9]{4}$'),
  mode text not null check (mode in ('standard', 'demo')),
  phase text not null default 'lobby' check (phase in ('lobby','learn','trait_review','role_reveal','challenge','objection','accuse','revealed')),
  checkpoint_kind text check (checkpoint_kind in ('awaiting_learn_questions','awaiting_contrast_question','awaiting_traits','awaiting_challenge_question','awaiting_suspicion','awaiting_objection_question','awaiting_objection_resolution','awaiting_accusation')),
  checkpoint_id uuid,
  revision bigint not null default 0,
  sequence bigint not null default 0,
  round smallint not null default 0 check (round between 0 and 4),
  timer_seconds smallint not null default 8 check (timer_seconds in (8, 15)),
  deadline timestamptz,
  reveal_at timestamptz,
  active_window_id uuid,
  window_kind text check (window_kind in ('answer','reveal_hold','blind_objection','accusation')),
  current_question_id uuid,
  current_round_id uuid,
  accusation_target text check (accusation_target in ('seat_a','seat_b')),
  accusation_evidence bigint[],
  accusation_reason text,
  winner text check (winner in ('humans','detective')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '12 hours',
  constraint checkpoint_pair check ((checkpoint_kind is null) = (checkpoint_id is null)),
  constraint agent_checkpoint_has_no_timer check (checkpoint_kind is null or (deadline is null and window_kind is null))
);

create table private.game_members (
  game_id uuid not null references private.games(id) on delete cascade,
  user_id uuid not null,
  member_role text not null check (member_role in ('host','seat_a','seat_b')),
  seat text check (seat in ('seat_a','seat_b')),
  sticker text check (sticker in ('tiger','frog','ghost','toast','moon','cherry')),
  ready boolean not null default false,
  role_acknowledged boolean not null default false,
  joined_at timestamptz not null default clock_timestamp(),
  primary key (game_id, user_id),
  unique (game_id, member_role),
  unique (game_id, seat),
  unique (game_id, sticker),
  constraint player_has_seat check ((member_role = 'host' and seat is null) or (member_role <> 'host' and seat = member_role))
);

create table private.question_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  game_id uuid not null references private.games(id) on delete cascade,
  checkpoint_id uuid not null,
  kind text not null check (kind in ('learn','contrast','challenge','objection')),
  created_at timestamptz not null default clock_timestamp(),
  unique (game_id, checkpoint_id)
);

create table private.game_questions (
  id uuid primary key default extensions.gen_random_uuid(),
  game_id uuid not null references private.games(id) on delete cascade,
  batch_id uuid references private.question_batches(id) on delete cascade,
  kind text not null check (kind in ('learn','contrast','challenge','objection')),
  ordinal smallint not null check (ordinal between 1 and 5),
  prompt text not null check (char_length(prompt) between 8 and 120),
  normalized_prompt text not null,
  target_seat text check (target_seat in ('seat_a','seat_b')),
  basis_evidence bigint[] not null default '{}',
  opened_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (game_id, normalized_prompt),
  unique (batch_id, ordinal)
);

create table private.game_question_options (
  id uuid primary key default extensions.gen_random_uuid(),
  question_id uuid not null references private.game_questions(id) on delete cascade,
  canonical_ordinal smallint not null,
  label text not null check (char_length(label) between 1 and 48),
  unique (question_id, canonical_ordinal),
  unique (question_id, label)
);

create table private.question_option_orders (
  question_id uuid not null references private.game_questions(id) on delete cascade,
  seat text not null check (seat in ('seat_a','seat_b')),
  option_id uuid not null references private.game_question_options(id) on delete cascade,
  display_ordinal smallint not null,
  primary key (question_id, seat, option_id),
  unique (question_id, seat, display_ordinal)
);

create table private.game_rounds (
  id uuid primary key default extensions.gen_random_uuid(),
  game_id uuid not null references private.games(id) on delete cascade,
  question_id uuid not null references private.game_questions(id),
  kind text not null check (kind in ('learn','contrast','challenge','objection')),
  ordinal smallint not null,
  status text not null default 'open' check (status in ('open','revealed')),
  window_id uuid not null unique,
  deadline timestamptz not null,
  revealed_at timestamptz,
  unique (game_id, kind, ordinal)
);

alter table private.games add constraint games_current_question_fk foreign key (current_question_id) references private.game_questions(id);
alter table private.games add constraint games_current_round_fk foreign key (current_round_id) references private.game_rounds(id);

create table private.private_roles (
  game_id uuid not null references private.games(id) on delete cascade,
  seat text not null check (seat in ('seat_a','seat_b')),
  role text not null check (role in ('original','mirror')),
  primary key (game_id, seat),
  unique (game_id, role)
);

create table private.sealed_answers (
  round_id uuid not null references private.game_rounds(id) on delete cascade,
  game_id uuid not null references private.games(id) on delete cascade,
  seat text not null check (seat in ('seat_a','seat_b')),
  option_id uuid references private.game_question_options(id),
  locked_at timestamptz not null default clock_timestamp(),
  reveal_sequence bigint,
  primary key (round_id, seat)
);

create table private.player_traits (
  id uuid primary key default extensions.gen_random_uuid(),
  game_id uuid not null references private.games(id) on delete cascade,
  seat text not null check (seat in ('seat_a','seat_b')),
  ordinal smallint not null check (ordinal in (1,2)),
  trait text not null check (char_length(trait) between 2 and 48),
  evidence_ids bigint[] not null,
  unique (game_id, seat, ordinal)
);

create table private.trait_feedback (
  trait_id uuid not null references private.player_traits(id) on delete cascade,
  game_id uuid not null references private.games(id) on delete cascade,
  seat text not null check (seat in ('seat_a','seat_b')),
  feedback text not null check (feedback in ('thats_me','not_me')),
  revealed_at timestamptz,
  primary key (trait_id, seat)
);

create table private.suspicions (
  id uuid primary key default extensions.gen_random_uuid(),
  game_id uuid not null references private.games(id) on delete cascade,
  round smallint not null check (round between 1 and 4),
  target_seat text not null check (target_seat in ('seat_a','seat_b')),
  reason text not null check (char_length(reason) between 2 and 140),
  evidence_ids bigint[] not null,
  is_public boolean not null default true,
  resolution text check (resolution in ('keep','switch')),
  created_at timestamptz not null default clock_timestamp(),
  unique (game_id, round)
);

create table private.objections (
  game_id uuid primary key references private.games(id) on delete cascade,
  available boolean not null default true,
  claimed_by text check (claimed_by in ('seat_a','seat_b')),
  pending_target text check (pending_target in ('seat_a','seat_b')),
  claimed_at timestamptz
);

create table private.agent_actions (
  game_id uuid not null references private.games(id) on delete cascade,
  checkpoint_id uuid not null,
  tool_name text not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (game_id, checkpoint_id, tool_name)
);

create table private.game_events (
  id bigint generated always as identity primary key,
  game_id uuid not null references private.games(id) on delete cascade,
  sequence bigint not null,
  actor text not null check (actor in ('system','host','seat_a','seat_b','detective')),
  event_type text not null,
  summary text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  unique (game_id, sequence)
);

create index game_events_after_idx on private.game_events(game_id, sequence);
create index sealed_answers_game_idx on private.sealed_answers(game_id, round_id);
create index questions_game_kind_idx on private.game_questions(game_id, kind, ordinal);

do $$
declare table_name text;
begin
  foreach table_name in array array['games','game_members','question_batches','game_questions','game_question_options','question_option_orders','game_rounds','private_roles','sealed_answers','player_traits','trait_feedback','suspicions','objections','agent_actions','game_events']
  loop
    execute format('alter table private.%I enable row level security', table_name);
    execute format('revoke all on private.%I from public, anon, authenticated', table_name);
  end loop;
end $$;

create or replace function private.is_member(p_game_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.game_members where game_id = p_game_id and user_id = auth.uid());
$$;

create or replace function private.viewer_role(p_game_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select member_role from private.game_members where game_id = p_game_id and user_id = auth.uid();
$$;

create or replace function private.new_room_code()
returns text language plpgsql volatile set search_path = '' as $$
declare candidate text;
begin
  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') into candidate
    from generate_series(1, 4);
    exit when not exists(select 1 from private.games where room_code = candidate and expires_at > clock_timestamp());
  end loop;
  return candidate;
end;
$$;

create or replace function private.public_projection(p_game_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  g private.games;
  players jsonb;
  question jsonb := null;
  suspicion jsonb := null;
  objection jsonb;
  timeline jsonb;
  evidence jsonb;
  actions jsonb := '[]';
  request jsonb := null;
  result jsonb := null;
  current_status text;
begin
  if not private.is_member(p_game_id) then raise exception 'NOT_AUTHORIZED'; end if;
  select * into g from private.games where id = p_game_id;
  if g.id is null then raise exception 'INVALID_ROOM'; end if;

  select jsonb_agg(jsonb_build_object(
    'seat', seats.seat,
    'sticker', m.sticker,
    'ready', coalesce(m.ready, false),
    'answered', exists(select 1 from private.sealed_answers a where a.round_id = g.current_round_id and a.seat = seats.seat),
    'traits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'text', t.trait,
        'feedback', case when f.revealed_at is not null then f.feedback else null end
      ) order by t.ordinal)
      from private.player_traits t
      left join private.trait_feedback f on f.trait_id = t.id and f.seat = seats.seat
      where t.game_id = p_game_id and t.seat = seats.seat
    ), '[]'::jsonb)
  ) order by seats.seat) into players
  from (values ('seat_a'),('seat_b')) seats(seat)
  left join private.game_members m on m.game_id = p_game_id and m.seat = seats.seat;

  if g.current_question_id is not null then
    select r.status into current_status from private.game_rounds r where r.id = g.current_round_id;
    select jsonb_strip_nulls(jsonb_build_object(
      'id', q.id,
      'kind', q.kind,
      'ordinal', q.ordinal,
      'prompt', q.prompt,
      'revealedAnswers', case when current_status = 'revealed' then (
        select jsonb_object_agg(seat, jsonb_build_object(
          'optionId', option_id,
          'label', coalesce((select label from private.game_question_options where id = option_id), 'No answer')
        )) from private.sealed_answers where round_id = g.current_round_id
      ) else null end
    )) into question
    from private.game_questions q where q.id = g.current_question_id;
  end if;

  select jsonb_build_object('id', s.id, 'round', s.round, 'targetSeat', s.target_seat, 'reason', s.reason, 'evidenceIds', s.evidence_ids, 'resolution', s.resolution)
  into suspicion from private.suspicions s where s.game_id = p_game_id and s.is_public order by s.round desc limit 1;

  select jsonb_build_object(
    'available', o.available,
    'claimedBy', o.claimed_by,
    'pendingTarget', case when g.checkpoint_kind = 'awaiting_objection_question' then o.pending_target else null end
  )
  into objection from private.objections o where o.game_id = p_game_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'sequence', e.sequence, 'type', e.event_type, 'actor', e.actor,
    'summary', e.summary, 'payload', e.payload, 'createdAt', e.created_at
  ) order by e.sequence), '[]'::jsonb) into timeline
  from private.game_events e where e.game_id = p_game_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'sequence', e.sequence, 'type', e.event_type, 'actor', e.actor,
    'summary', e.summary, 'payload', e.payload, 'createdAt', e.created_at
  ) order by e.sequence), '[]'::jsonb) into evidence
  from private.game_events e
  where e.game_id = p_game_id and e.event_type in ('answers_revealed','traits_published','trait_feedback_revealed','suspicion_placed','suspicion_revealed','objection_answer_revealed','objection_resolved','demo_fixture_loaded');

  if g.checkpoint_kind is not null then
    actions := jsonb_build_array(case g.checkpoint_kind
      when 'awaiting_learn_questions' then 'propose_learn_questions'
      when 'awaiting_contrast_question' then 'propose_contrast_question'
      when 'awaiting_traits' then 'propose_player_traits'
      when 'awaiting_challenge_question' then 'propose_challenge_question'
      when 'awaiting_suspicion' then 'place_suspicion'
      when 'awaiting_objection_question' then 'propose_objection_question'
      when 'awaiting_objection_resolution' then 'resolve_objection'
      when 'awaiting_accusation' then 'propose_accusation'
    end);
  end if;

  if g.checkpoint_kind in ('awaiting_learn_questions','awaiting_contrast_question','awaiting_challenge_question','awaiting_objection_question') then
    request := jsonb_strip_nulls(jsonb_build_object(
      'kind', case g.checkpoint_kind when 'awaiting_learn_questions' then 'learn_batch' when 'awaiting_contrast_question' then 'contrast' when 'awaiting_challenge_question' then 'challenge' else 'objection' end,
      'count', case when g.checkpoint_kind = 'awaiting_learn_questions' then 5 else 1 end,
      'optionCount', case when g.checkpoint_kind = 'awaiting_objection_question' then 3 else 4 end,
      'round', case when g.checkpoint_kind = 'awaiting_challenge_question' then g.round else null end,
      'targetSeat', case when g.checkpoint_kind = 'awaiting_objection_question' then objection->'pendingTarget' else null end,
      'limits', jsonb_build_object('promptMin',8,'promptMax',120,'optionMin',1,'optionMax',48)
    ));
  end if;

  if g.phase = 'revealed' then
    select jsonb_build_object(
      'originalSeat', max(seat) filter (where role = 'original'),
      'mirrorSeat', max(seat) filter (where role = 'mirror'),
      'winner', g.winner
    ) into result from private.private_roles where game_id = p_game_id;
  end if;

  return jsonb_build_object(
    'gameId', g.id,
    'roomCode', g.room_code,
    'mode', g.mode,
    'phase', g.phase,
    'checkpoint', case when g.checkpoint_kind is null then null else jsonb_build_object('id',g.checkpoint_id,'kind',g.checkpoint_kind) end,
    'revision', g.revision,
    'sequence', g.sequence,
    'round', g.round,
    'timerSeconds', g.timer_seconds,
    'serverNowMs', floor(extract(epoch from clock_timestamp()) * 1000),
    'deadlineMs', case when g.deadline is null then null else floor(extract(epoch from g.deadline) * 1000) end,
    'activeWindowId', g.active_window_id,
    'revealAtMs', case when g.reveal_at is null then null else floor(extract(epoch from g.reveal_at) * 1000) end,
    'players', players,
    'currentQuestion', question,
    'suspicion', suspicion,
    'objection', coalesce(objection, jsonb_build_object('available',true,'claimedBy',null,'pendingTarget',null)),
    'accusation', case when g.accusation_target is null then null else jsonb_build_object('targetSeat',g.accusation_target,'evidenceIds',g.accusation_evidence) end,
    'result', result,
    'timeline', timeline,
    'eligibleEvidence', evidence,
    'eligibleAgentActions', actions,
    'questionRequest', request
  );
end;
$$;

create or replace function private.player_projection(p_game_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g private.games; member private.game_members; role_value text; options jsonb := '[]'; selected uuid; can_answer boolean := false; feedback_ids jsonb; objection_can boolean := false;
begin
  select * into member from private.game_members where game_id = p_game_id and user_id = auth.uid() and seat is not null;
  if member.game_id is null then return null; end if;
  select * into g from private.games where id = p_game_id;
  select role into role_value from private.private_roles where game_id = p_game_id and seat = member.seat;
  select option_id into selected from private.sealed_answers where round_id = g.current_round_id and seat = member.seat;
  can_answer := g.window_kind = 'answer' and g.deadline > clock_timestamp() and selected is null and (
    not exists(select 1 from private.game_questions where id = g.current_question_id and kind = 'objection')
    or exists(select 1 from private.game_questions where id = g.current_question_id and target_seat = member.seat)
  );
  if can_answer then
    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by ord.display_ordinal), '[]'::jsonb)
    into options
    from private.question_option_orders ord join private.game_question_options o on o.id = ord.option_id
    where ord.question_id = g.current_question_id and ord.seat = member.seat;
  end if;
  select coalesce(jsonb_agg(t.id order by t.ordinal), '[]'::jsonb) into feedback_ids
  from private.player_traits t
  where t.game_id = p_game_id and t.seat = member.seat
    and not exists(select 1 from private.trait_feedback f where f.trait_id = t.id and f.seat = member.seat);
  select g.window_kind = 'blind_objection' and g.deadline > clock_timestamp() and o.available and o.claimed_by is null
  into objection_can from private.objections o where o.game_id = p_game_id;
  return jsonb_build_object(
    'seat', member.seat,
    'role', role_value,
    'options', options,
    'canAnswer', can_answer,
    'selectedOptionId', selected,
    'canClaimObjection', coalesce(objection_can,false),
    'traitFeedbackRequiredIds', feedback_ids,
    'roleAcknowledged', member.role_acknowledged
  );
end;
$$;

create or replace function private.bootstrap_payload(p_game_id uuid, p_viewer text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'viewerKind', p_viewer,
    'publicState', private.public_projection(p_game_id),
    'selfState', case when p_viewer in ('seat_a','seat_b') then private.player_projection(p_game_id) else null end
  );
$$;

create or replace function private.emit_event(p_game_id uuid, p_actor text, p_type text, p_summary text, p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare next_revision bigint; next_sequence bigint; event_id bigint;
begin
  update private.games set revision = revision + 1, sequence = sequence + 1
  where id = p_game_id returning revision, sequence into next_revision, next_sequence;
  insert into private.game_events(game_id, sequence, actor, event_type, summary, payload)
  values (p_game_id, next_sequence, p_actor, p_type, p_summary, coalesce(p_payload, '{}')) returning id into event_id;
  perform realtime.send(
    jsonb_build_object('gameId', p_game_id, 'revision', next_revision, 'sequence', next_sequence, 'eventType', p_type),
    'game_changed', 'game:' || p_game_id::text, true
  );
  return jsonb_build_object('revision', next_revision, 'sequence', next_sequence, 'eventId', event_id);
end;
$$;

create or replace function private.assign_roles(p_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare original text;
begin
  if exists(select 1 from private.private_roles where game_id = p_game_id) then return; end if;
  original := case when random() < 0.5 then 'seat_a' else 'seat_b' end;
  insert into private.private_roles(game_id, seat, role) values
    (p_game_id, original, 'original'),
    (p_game_id, case when original = 'seat_a' then 'seat_b' else 'seat_a' end, 'mirror');
end;
$$;

create or replace function private.open_question(p_game_id uuid, p_question_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g private.games; q private.game_questions; round_id uuid := extensions.gen_random_uuid(); window_id uuid := extensions.gen_random_uuid(); deadline_at timestamptz;
begin
  select * into g from private.games where id = p_game_id for update;
  select * into q from private.game_questions where id = p_question_id and game_id = p_game_id;
  if q.id is null then raise exception 'INVALID_QUESTION'; end if;
  deadline_at := clock_timestamp() + make_interval(secs => g.timer_seconds);
  update private.game_questions set opened_at = clock_timestamp() where id = q.id;
  insert into private.game_rounds(id, game_id, question_id, kind, ordinal, window_id, deadline)
  values (round_id, p_game_id, q.id, q.kind, q.ordinal, window_id, deadline_at);
  insert into private.question_option_orders(question_id, seat, option_id, display_ordinal)
  select q.id, seat, option_id, row_number() over (partition by seat order by extensions.digest(option_id::text || seat, 'sha256'))
  from (values ('seat_a'),('seat_b')) seats(seat)
  cross join lateral (select id as option_id from private.game_question_options where question_id = q.id) options;
  update private.games set
    phase = case when q.kind in ('learn','contrast') then 'learn' when q.kind = 'challenge' then 'challenge' else 'objection' end,
    current_question_id = q.id, current_round_id = round_id, active_window_id = window_id,
    deadline = deadline_at, reveal_at = null, window_kind = 'answer', checkpoint_kind = null, checkpoint_id = null
  where id = p_game_id;
end;
$$;

create or replace function private.join_projection(p_game_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g private.games; players jsonb;
begin
  select * into g from private.games where id = p_game_id;
  if g.id is null or g.phase <> 'lobby' or g.expires_at <= clock_timestamp() then raise exception 'INVALID_ROOM'; end if;
  select jsonb_agg(jsonb_build_object(
    'seat', seats.seat, 'sticker', m.sticker, 'ready', coalesce(m.ready,false), 'answered', false, 'traits', '[]'::jsonb
  ) order by seats.seat) into players
  from (values ('seat_a'),('seat_b')) seats(seat)
  left join private.game_members m on m.game_id = p_game_id and m.seat = seats.seat;
  return jsonb_build_object(
    'gameId',g.id,'roomCode',g.room_code,'mode',g.mode,'phase',g.phase,'checkpoint',null,
    'revision',g.revision,'sequence',g.sequence,'round',0,'timerSeconds',g.timer_seconds,
    'serverNowMs',floor(extract(epoch from clock_timestamp())*1000),'deadlineMs',null,'activeWindowId',null,'revealAtMs',null,
    'players',players,'currentQuestion',null,'suspicion',null,
    'objection',jsonb_build_object('available',true,'claimedBy',null,'pendingTarget',null),
    'accusation',null,'result',null,'timeline','[]'::jsonb,'eligibleEvidence','[]'::jsonb,
    'eligibleAgentActions','[]'::jsonb,'questionRequest',null
  );
end;
$$;

create or replace function private.seed_demo_fixture(p_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare batch_id uuid := extensions.gen_random_uuid(); checkpoint_id uuid := extensions.gen_random_uuid(); q jsonb; q_id uuid; q_ord int := 0; seat_value text; fixture_round_id uuid; fixture_window_id uuid;
begin
  insert into private.question_batches(id,game_id,checkpoint_id,kind) values(batch_id,p_game_id,checkpoint_id,'learn');
  for q in select * from jsonb_array_elements('[
    {"prompt":"What is your ideal accidental free afternoon?","options":["Find a tiny cafe","Take a long walk","Start a weird project","Call a friend"],"seatA":3,"seatB":1},
    {"prompt":"Which snack disappears fastest around you?","options":["Salty chips","Fresh fruit","Something chocolate","Spicy noodles"],"seatA":1,"seatB":1},
    {"prompt":"How early do you arrive for a trip?","options":["Almost an hour early","Exactly on time","A little late","Running to the gate"],"seatA":1,"seatB":4},
    {"prompt":"What wins when choosing a weekend plan?","options":["A good story","Maximum comfort","Trying something new","Who is coming"],"seatA":3,"seatB":4},
    {"prompt":"Which tiny inconvenience tests you most?","options":["A slow walker","A dying phone","A long menu","A missing sock"],"seatA":2,"seatB":2}
  ]'::jsonb)
  loop
    q_ord := q_ord + 1;
    q_id := extensions.gen_random_uuid();
    insert into private.game_questions(id,game_id,batch_id,kind,ordinal,prompt,normalized_prompt,opened_at)
    values(q_id,p_game_id,batch_id,'learn',q_ord,q->>'prompt',lower(q->>'prompt'),clock_timestamp());
    insert into private.game_question_options(question_id,canonical_ordinal,label)
    select q_id, ordinality, value from jsonb_array_elements_text(q->'options') with ordinality;
    fixture_round_id := extensions.gen_random_uuid();
    fixture_window_id := extensions.gen_random_uuid();
    insert into private.game_rounds(id,game_id,question_id,kind,ordinal,status,window_id,deadline,revealed_at)
    values(fixture_round_id,p_game_id,q_id,'learn',q_ord,'revealed',fixture_window_id,clock_timestamp(),clock_timestamp());
    insert into private.sealed_answers(round_id,game_id,seat,option_id)
    select fixture_round_id,p_game_id,'seat_a',id from private.game_question_options where question_id=q_id and canonical_ordinal=(q->>'seatA')::int;
    insert into private.sealed_answers(round_id,game_id,seat,option_id)
    select fixture_round_id,p_game_id,'seat_b',id from private.game_question_options where question_id=q_id and canonical_ordinal=(q->>'seatB')::int;
  end loop;
  foreach seat_value in array array['seat_a','seat_b'] loop
    insert into private.player_traits(game_id,seat,ordinal,trait,evidence_ids) values
      (p_game_id,seat_value,1,case when seat_value='seat_a' then 'Curious instigator' else 'Calm improviser' end,'{}'),
      (p_game_id,seat_value,2,case when seat_value='seat_a' then 'Plans around snacks' else 'Thrives under pressure' end,'{}');
  end loop;
  perform private.assign_roles(p_game_id);
  update private.games set phase='role_reveal',checkpoint_kind=null,checkpoint_id=null,deadline=null,window_kind=null,current_question_id=null,current_round_id=null where id=p_game_id;
end;
$$;

create or replace function api.create_game(p_mode text default 'standard', p_timer_seconds integer default 8)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare game_id uuid := extensions.gen_random_uuid(); code text; event_result jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_mode not in ('standard','demo') or p_timer_seconds not in (8,15) then raise exception 'INVALID_INPUT'; end if;
  code := private.new_room_code();
  insert into private.games(id,room_code,mode,timer_seconds) values(game_id,code,p_mode,p_timer_seconds);
  insert into private.game_members(game_id,user_id,member_role) values(game_id,auth.uid(),'host');
  insert into private.objections(game_id) values(game_id);
  event_result := private.emit_event(game_id,'host','game_created','Room created',jsonb_build_object('mode',p_mode));
  return private.bootstrap_payload(game_id,'host');
end;
$$;

create or replace function api.bootstrap_room(p_room_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g private.games; viewer text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHORIZED'; end if;
  select * into g from private.games where room_code=upper(trim(p_room_code)) and expires_at>clock_timestamp();
  if g.id is null then raise exception 'INVALID_ROOM'; end if;
  select member_role into viewer from private.game_members where game_id=g.id and user_id=auth.uid();
  if viewer is null then
    if g.phase <> 'lobby' then raise exception 'ROOM_FULL'; end if;
    return jsonb_build_object('viewerKind','join','publicState',private.join_projection(g.id),'selfState',null);
  end if;
  return private.bootstrap_payload(g.id,viewer);
end;
$$;

create or replace function api.claim_seat(p_room_code text, p_sticker text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g private.games; existing text; seat_value text; player_count int; event_result jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHORIZED'; end if;
  select * into g from private.games where room_code=upper(trim(p_room_code)) and expires_at>clock_timestamp() for update;
  if g.id is null or g.phase <> 'lobby' then raise exception 'INVALID_ROOM'; end if;
  if p_sticker not in ('tiger','frog','ghost','toast','moon','cherry') then raise exception 'INVALID_STICKER'; end if;
  select member_role into existing from private.game_members where game_id=g.id and user_id=auth.uid();
  if existing is not null then return private.bootstrap_payload(g.id,existing); end if;
  select count(*) into player_count from private.game_members where game_id=g.id and seat is not null;
  if player_count >= 2 then raise exception 'ROOM_FULL'; end if;
  if exists(select 1 from private.game_members where game_id=g.id and sticker=p_sticker) then raise exception 'STICKER_TAKEN'; end if;
  seat_value := case when exists(select 1 from private.game_members where game_id=g.id and seat='seat_a') then 'seat_b' else 'seat_a' end;
  insert into private.game_members(game_id,user_id,member_role,seat,sticker) values(g.id,auth.uid(),seat_value,seat_value,p_sticker);
  event_result := private.emit_event(g.id,seat_value,'player_joined',case when seat_value='seat_a' then 'Player A joined' else 'Player B joined' end,jsonb_build_object('seat',seat_value,'sticker',p_sticker));
  return private.bootstrap_payload(g.id,seat_value);
end;
$$;

create or replace function api.set_timer_mode(p_game_id uuid, p_timer_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g private.games; event_result jsonb;
begin
  select * into g from private.games where id=p_game_id for update;
  if private.viewer_role(p_game_id) <> 'host' then raise exception 'NOT_AUTHORIZED'; end if;
  if g.phase <> 'lobby' or p_timer_seconds not in (8,15) or exists(select 1 from private.game_members where game_id=p_game_id and seat is not null and ready) then raise exception 'INVALID_PHASE'; end if;
  if g.timer_seconds = p_timer_seconds then return private.bootstrap_payload(p_game_id,'host'); end if;
  update private.games set timer_seconds=p_timer_seconds where id=p_game_id;
  event_result := private.emit_event(p_game_id,'host','timer_changed','Answer timer updated',jsonb_build_object('seconds',p_timer_seconds));
  return private.bootstrap_payload(p_game_id,'host');
end;
$$;

create or replace function api.set_ready(p_game_id uuid, p_ready boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g private.games; viewer text; both_ready boolean; event_result jsonb;
begin
  select * into g from private.games where id=p_game_id for update;
  viewer := private.viewer_role(p_game_id);
  if viewer not in ('seat_a','seat_b') then raise exception 'NOT_AUTHORIZED'; end if;
  if g.phase <> 'lobby' then raise exception 'INVALID_PHASE'; end if;
  update private.game_members set ready=p_ready where game_id=p_game_id and user_id=auth.uid();
  select count(*)=2 into both_ready from private.game_members where game_id=p_game_id and seat is not null and ready;
  if both_ready then
    if g.mode='demo' then
      perform private.seed_demo_fixture(p_game_id);
      event_result := private.emit_event(
        p_game_id,
        'system',
        'demo_fixture_loaded',
        'Demo memories loaded; secret roles are ready',
        jsonb_build_object(
          'fixtureVersion','demo-v1',
          'learnDifferences',3,
          'traitsPerPlayer',2,
          'learnEvidence',(
            select jsonb_agg(jsonb_build_object(
              'questionId',q.id,
              'prompt',q.prompt,
              'seatA',oa.label,
              'seatB',ob.label
            ) order by q.ordinal)
            from private.game_questions q
            join private.game_rounds r on r.question_id=q.id
            join private.sealed_answers aa on aa.round_id=r.id and aa.seat='seat_a'
            join private.game_question_options oa on oa.id=aa.option_id
            join private.sealed_answers ab on ab.round_id=r.id and ab.seat='seat_b'
            join private.game_question_options ob on ob.id=ab.option_id
            where q.game_id=p_game_id and q.kind='learn'
          )
        )
      );
    else
      update private.games set checkpoint_kind='awaiting_learn_questions',checkpoint_id=extensions.gen_random_uuid(),deadline=null,window_kind=null where id=p_game_id;
      event_result := private.emit_event(p_game_id,'system','players_ready','Both players are ready; the Detective can create Learn questions','{}');
    end if;
  else
    event_result := private.emit_event(p_game_id,viewer,'ready_changed',case when p_ready then 'Player is ready' else 'Player is not ready' end,jsonb_build_object('seat',viewer,'ready',p_ready));
  end if;
  return private.bootstrap_payload(p_game_id,viewer);
end;
$$;

create or replace function api.get_public_game_state(p_game_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.public_projection(p_game_id); $$;

create or replace function api.get_player_self_state(p_game_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.player_projection(p_game_id); $$;

create or replace function api.get_events_after(p_game_id uuid, p_after_sequence bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member(p_game_id) then raise exception 'NOT_AUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', event.id,
        'sequence', event.sequence,
        'type', event.event_type,
        'actor', event.actor,
        'summary', event.summary,
        'payload', event.payload,
        'createdAt', event.created_at
      ) order by event.sequence
    )
    from (
      select id, sequence, event_type, actor, summary, payload, created_at
      from private.game_events
      where game_id = p_game_id and sequence > p_after_sequence
      order by sequence
      limit 20
    ) as event
  ), '[]'::jsonb);
end;
$$;

create or replace function private.finish_answer_window(p_game_id uuid, p_timed_out boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g private.games; r private.game_rounds; q private.game_questions; seat_value text; event_result jsonb;
begin
  select * into g from private.games where id=p_game_id for update;
  select * into r from private.game_rounds where id=g.current_round_id;
  select * into q from private.game_questions where id=g.current_question_id;
  if r.id is null or r.status <> 'open' then raise exception 'INVALID_PHASE'; end if;
  if q.kind='objection' then
    insert into private.sealed_answers(round_id,game_id,seat,option_id)
    values(r.id,p_game_id,q.target_seat,null) on conflict do nothing;
  else
    foreach seat_value in array array['seat_a','seat_b'] loop
      insert into private.sealed_answers(round_id,game_id,seat,option_id)
      values(r.id,p_game_id,seat_value,null) on conflict do nothing;
    end loop;
  end if;
  update private.game_rounds set status='revealed',revealed_at=clock_timestamp() where id=r.id;
  update private.sealed_answers set reveal_sequence=g.sequence+1 where round_id=r.id;
  if q.kind in ('learn','contrast') then
    update private.games set active_window_id=extensions.gen_random_uuid(),deadline=clock_timestamp()+interval '2 seconds',window_kind='reveal_hold',checkpoint_kind=null,checkpoint_id=null where id=p_game_id;
  elsif q.kind='challenge' then
    update private.games set deadline=null,active_window_id=null,window_kind=null,checkpoint_kind='awaiting_suspicion',checkpoint_id=extensions.gen_random_uuid() where id=p_game_id;
  else
    update private.games set deadline=null,active_window_id=null,window_kind=null,checkpoint_kind='awaiting_objection_resolution',checkpoint_id=extensions.gen_random_uuid() where id=p_game_id;
  end if;
  event_result := private.emit_event(p_game_id,'system',case when q.kind='objection' then 'objection_answer_revealed' else 'answers_revealed' end,
    case when p_timed_out then 'Answers revealed after time expired' when q.kind='objection' then 'Objection answer revealed' else 'Answers revealed together' end,
    jsonb_build_object('questionId',q.id,'kind',q.kind,'ordinal',q.ordinal,'timedOut',p_timed_out,
      'answers',(select jsonb_object_agg(a.seat,coalesce(o.label,'No answer')) from private.sealed_answers a left join private.game_question_options o on o.id=a.option_id where a.round_id=r.id)));
  return event_result;
end;
$$;

create or replace function api.submit_answer(p_game_id uuid, p_window_id uuid, p_option_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g private.games; r private.game_rounds; q private.game_questions; viewer text; answer_count int; event_result jsonb;
begin
  select * into g from private.games where id=p_game_id for update;
  viewer := private.viewer_role(p_game_id);
  if viewer not in ('seat_a','seat_b') then raise exception 'NOT_AUTHORIZED'; end if;
  if g.window_kind<>'answer' or g.active_window_id<>p_window_id or g.deadline<=clock_timestamp() then raise exception 'CHECKPOINT_EXPIRED'; end if;
  select * into r from private.game_rounds where id=g.current_round_id and status='open';
  select * into q from private.game_questions where id=g.current_question_id;
  if q.kind='objection' and q.target_seat<>viewer then raise exception 'NOT_AUTHORIZED'; end if;
  if not exists(select 1 from private.game_question_options where id=p_option_id and question_id=q.id) then raise exception 'INVALID_QUESTION'; end if;
  insert into private.sealed_answers(round_id,game_id,seat,option_id) values(r.id,p_game_id,viewer,p_option_id) on conflict do nothing;
  if not found then return private.bootstrap_payload(p_game_id,viewer); end if;
  select count(*) into answer_count from private.sealed_answers where round_id=r.id;
  if q.kind='objection' or answer_count=2 then
    event_result := private.finish_answer_window(p_game_id,false);
  else
    event_result := private.emit_event(p_game_id,viewer,'answer_locked',case when viewer='seat_a' then 'Player A locked an answer' else 'Player B locked an answer' end,jsonb_build_object('seat',viewer));
  end if;
  return private.bootstrap_payload(p_game_id,viewer);
end;
$$;

create or replace function api.submit_trait_feedback(p_game_id uuid, p_trait_id uuid, p_feedback text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g private.games; viewer text; expected_count int; feedback_count int; event_result jsonb;
begin
  select * into g from private.games where id=p_game_id for update;
  viewer:=private.viewer_role(p_game_id);
  if viewer not in ('seat_a','seat_b') then raise exception 'NOT_AUTHORIZED'; end if;
  if g.phase<>'trait_review' or p_feedback not in ('thats_me','not_me') then raise exception 'INVALID_PHASE'; end if;
  if not exists(select 1 from private.player_traits where id=p_trait_id and game_id=p_game_id and seat=viewer) then raise exception 'NOT_AUTHORIZED'; end if;
  insert into private.trait_feedback(trait_id,game_id,seat,feedback) values(p_trait_id,p_game_id,viewer,p_feedback) on conflict do nothing;
  if not found then return private.bootstrap_payload(p_game_id,viewer); end if;
  select count(*) into expected_count from private.player_traits where game_id=p_game_id;
  select count(*) into feedback_count from private.trait_feedback where game_id=p_game_id;
  if feedback_count=expected_count and expected_count=4 then
    update private.trait_feedback set revealed_at=clock_timestamp() where game_id=p_game_id;
    perform private.assign_roles(p_game_id);
    update private.games set phase='role_reveal',checkpoint_kind=null,checkpoint_id=null,current_question_id=null,current_round_id=null,deadline=null,window_kind=null where id=p_game_id;
    event_result:=private.emit_event(p_game_id,'system','trait_feedback_revealed','Both players reviewed their Detective traits','{}');
  else
    event_result:=private.emit_event(p_game_id,viewer,'trait_feedback_locked','A player locked private trait feedback',jsonb_build_object('seat',viewer));
  end if;
  return private.bootstrap_payload(p_game_id,viewer);
end;
$$;

create or replace function api.acknowledge_role(p_game_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g private.games; viewer text; ack_count int; event_result jsonb;
begin
  select * into g from private.games where id=p_game_id for update;
  viewer:=private.viewer_role(p_game_id);
  if viewer not in ('seat_a','seat_b') then raise exception 'NOT_AUTHORIZED'; end if;
  if g.phase<>'role_reveal' then raise exception 'INVALID_PHASE'; end if;
  update private.game_members set role_acknowledged=true where game_id=p_game_id and user_id=auth.uid() and not role_acknowledged;
  if not found then return private.bootstrap_payload(p_game_id,viewer); end if;
  select count(*) into ack_count from private.game_members where game_id=p_game_id and seat is not null and role_acknowledged;
  if ack_count=2 then
    update private.games set phase='challenge',round=1,checkpoint_kind='awaiting_challenge_question',checkpoint_id=extensions.gen_random_uuid() where id=p_game_id;
    event_result:=private.emit_event(p_game_id,'system','roles_acknowledged','Both players know their secret roles; Challenge 1 is ready','{}');
  else
    event_result:=private.emit_event(p_game_id,viewer,'role_acknowledged','A player privately acknowledged their role',jsonb_build_object('seat',viewer));
  end if;
  return private.bootstrap_payload(p_game_id,viewer);
end;
$$;

create or replace function api.claim_objection(p_game_id uuid, p_window_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g private.games; viewer text; staged private.suspicions; event_result jsonb;
begin
  select * into g from private.games where id=p_game_id for update;
  viewer:=private.viewer_role(p_game_id);
  if viewer not in ('seat_a','seat_b') then raise exception 'NOT_AUTHORIZED'; end if;
  if g.window_kind<>'blind_objection' or g.active_window_id<>p_window_id or g.deadline<=clock_timestamp() then raise exception 'CHECKPOINT_EXPIRED'; end if;
  update private.objections set available=false,claimed_by=viewer,claimed_at=clock_timestamp() where game_id=p_game_id and available and claimed_by is null;
  if not found then return private.bootstrap_payload(p_game_id,viewer); end if;
  update private.suspicions set is_public=true where game_id=p_game_id and round=3 returning * into staged;
  update private.objections set pending_target=staged.target_seat where game_id=p_game_id;
  update private.games set deadline=null,active_window_id=null,window_kind=null,checkpoint_kind='awaiting_objection_question',checkpoint_id=extensions.gen_random_uuid() where id=p_game_id;
  event_result:=private.emit_event(p_game_id,viewer,'objection_claimed','Objection claimed; the hidden suspicion is revealed',jsonb_build_object('claimedBy',viewer,'targetSeat',staged.target_seat,'reason',staged.reason));
  return private.bootstrap_payload(p_game_id,viewer);
end;
$$;

create or replace function api.advance_if_due(p_game_id uuid, p_window_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g private.games; viewer text; q private.game_questions; next_q uuid; difference_count int; original_seat text; event_result jsonb; staged private.suspicions;
begin
  select * into g from private.games where id=p_game_id for update;
  viewer:=private.viewer_role(p_game_id);
  if viewer is null then raise exception 'NOT_AUTHORIZED'; end if;
  if g.active_window_id<>p_window_id then return private.bootstrap_payload(p_game_id,viewer); end if;
  if coalesce(g.deadline,g.reveal_at)>clock_timestamp() then return private.bootstrap_payload(p_game_id,viewer); end if;
  if g.window_kind='answer' then
    event_result:=private.finish_answer_window(p_game_id,true);
  elsif g.window_kind='reveal_hold' then
    select * into q from private.game_questions where id=g.current_question_id;
    if q.kind='learn' and q.ordinal<5 then
      select id into next_q from private.game_questions where game_id=p_game_id and kind='learn' and ordinal=q.ordinal+1;
      perform private.open_question(p_game_id,next_q);
      event_result:=private.emit_event(p_game_id,'system','question_opened','Next Learn question opened',jsonb_build_object('kind','learn','ordinal',q.ordinal+1));
    elsif q.kind='learn' then
      select count(*) into difference_count from private.game_rounds r
      join private.game_questions lq on lq.id=r.question_id and lq.kind='learn'
      left join private.sealed_answers a on a.round_id=r.id and a.seat='seat_a'
      left join private.sealed_answers b on b.round_id=r.id and b.seat='seat_b'
      where r.game_id=p_game_id and a.option_id is distinct from b.option_id;
      update private.games set deadline=null,active_window_id=null,window_kind=null,current_question_id=null,current_round_id=null,
        checkpoint_kind=case when difference_count<2 then 'awaiting_contrast_question' else 'awaiting_traits' end,
        checkpoint_id=extensions.gen_random_uuid() where id=p_game_id;
      event_result:=private.emit_event(p_game_id,'system','learn_completed','Learn completed',jsonb_build_object('differences',difference_count,'contrastRequired',difference_count<2));
    else
      update private.games set deadline=null,active_window_id=null,window_kind=null,current_question_id=null,current_round_id=null,checkpoint_kind='awaiting_traits',checkpoint_id=extensions.gen_random_uuid() where id=p_game_id;
      event_result:=private.emit_event(p_game_id,'system','contrast_completed','Contrast question completed','{}');
    end if;
  elsif g.window_kind='blind_objection' then
    update private.suspicions set is_public=true where game_id=p_game_id and round=3 returning * into staged;
    update private.games set phase='challenge',round=4,deadline=null,active_window_id=null,window_kind=null,current_question_id=null,current_round_id=null,checkpoint_kind='awaiting_challenge_question',checkpoint_id=extensions.gen_random_uuid() where id=p_game_id;
    event_result:=private.emit_event(p_game_id,'system','suspicion_revealed','The Q3 suspicion is revealed; no Objection was used',jsonb_build_object('targetSeat',staged.target_seat,'reason',staged.reason));
  elsif g.window_kind='accusation' then
    select seat into original_seat from private.private_roles where game_id=p_game_id and role='original';
    update private.games set phase='revealed',winner=case when accusation_target=original_seat then 'humans' else 'detective' end,deadline=null,reveal_at=null,active_window_id=null,window_kind=null where id=p_game_id;
    event_result:=private.emit_event(p_game_id,'system','roles_revealed','Roles revealed and the case is closed',jsonb_build_object('originalSeat',original_seat,'accusedSeat',g.accusation_target));
  else
    raise exception 'INVALID_PHASE';
  end if;
  return private.bootstrap_payload(p_game_id,viewer);
end;
$$;

create or replace function private.assert_evidence(p_game_id uuid, p_ids jsonb, p_min integer default 1)
returns bigint[] language plpgsql stable security definer set search_path = '' as $$
declare ids bigint[]; valid_count int;
begin
  select coalesce(array_agg(value::bigint),'{}') into ids from jsonb_array_elements_text(coalesce(p_ids,'[]'::jsonb));
  if cardinality(ids)<p_min then raise exception 'INVALID_EVIDENCE'; end if;
  select count(*) into valid_count from private.game_events where game_id=p_game_id and id=any(ids)
    and event_type in ('answers_revealed','traits_published','trait_feedback_revealed','suspicion_placed','suspicion_revealed','objection_answer_revealed','objection_resolved','demo_fixture_loaded');
  if valid_count<>cardinality(ids) then raise exception 'INVALID_EVIDENCE'; end if;
  return ids;
end;
$$;

create or replace function private.publish_questions(p_game_id uuid, p_checkpoint_id uuid, p_kind text, p_payload jsonb, p_expected_count int, p_expected_options int, p_target text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare questions jsonb; item jsonb; options jsonb; prompt_value text; normalized text; basis bigint[]; batch_id uuid:=extensions.gen_random_uuid(); question_id uuid; idx int:=0; option_count int; first_question uuid;
begin
  questions:=case when p_expected_count=1 then jsonb_build_array(p_payload->'question') else p_payload->'questions' end;
  if questions is null or jsonb_typeof(questions)<>'array' or jsonb_array_length(questions)<>p_expected_count then raise exception 'INVALID_QUESTION:count'; end if;
  for item in select * from jsonb_array_elements(questions) loop
    prompt_value:=regexp_replace(trim(coalesce(item->>'prompt','')), '\s+', ' ', 'g');
    options:=item->'options';
    if char_length(prompt_value) not between 8 and 120
      or prompt_value ~ '[[:cntrl:]]'
      or prompt_value ~* '(https?://|www\.|<[^>]*>)'
      or prompt_value ~ '[\[\]*_`~]'
      or prompt_value ~ '^[[:space:]]*[#>+-][[:space:]]'
    then raise exception 'INVALID_QUESTION:prompt'; end if;
    normalized:=lower(prompt_value);
    if exists(select 1 from private.game_questions where game_id=p_game_id and normalized_prompt=normalized) then raise exception 'INVALID_QUESTION:duplicate_prompt'; end if;
    if options is null or jsonb_typeof(options)<>'array' or jsonb_array_length(options)<>p_expected_options then raise exception 'INVALID_QUESTION:option_count'; end if;
    select count(*) into option_count from (select distinct lower(regexp_replace(trim(value),'\s+',' ','g')) value from jsonb_array_elements_text(options)) unique_options;
    if option_count<>p_expected_options then raise exception 'INVALID_QUESTION:duplicate_option'; end if;
    if exists(
      select 1 from jsonb_array_elements_text(options)
      where char_length(regexp_replace(trim(value),'\s+',' ','g')) not between 1 and 48
        or value ~ '[[:cntrl:]]'
        or value ~* '(https?://|www\.|<[^>]*>)'
        or value ~ '[\[\]*_`~]'
        or value ~ '^[[:space:]]*[#>+-][[:space:]]'
    ) then raise exception 'INVALID_QUESTION:option'; end if;
    if p_kind='learn' then basis:='{}'; else basis:=private.assert_evidence(p_game_id,item->'basisEvidenceIds',1); end if;
  end loop;

  insert into private.question_batches(id,game_id,checkpoint_id,kind) values(batch_id,p_game_id,p_checkpoint_id,p_kind);
  for item in select * from jsonb_array_elements(questions) loop
    idx:=idx+1;
    prompt_value:=regexp_replace(trim(item->>'prompt'),'\s+',' ','g');
    basis:=case when p_kind='learn' then '{}' else private.assert_evidence(p_game_id,item->'basisEvidenceIds',1) end;
    question_id:=extensions.gen_random_uuid();
    if first_question is null then first_question:=question_id; end if;
    insert into private.game_questions(id,game_id,batch_id,kind,ordinal,prompt,normalized_prompt,target_seat,basis_evidence)
    values(question_id,p_game_id,batch_id,p_kind,case when p_kind='challenge' then (select round from private.games where id=p_game_id) else idx end,prompt_value,lower(prompt_value),p_target,basis);
    insert into private.game_question_options(question_id,canonical_ordinal,label)
    select question_id,ordinality,regexp_replace(trim(value),'\s+',' ','g') from jsonb_array_elements_text(item->'options') with ordinality;
  end loop;
  return jsonb_build_object('batchId',batch_id,'firstQuestionId',first_question,'acceptedCount',p_expected_count);
end;
$$;

create or replace function private.tool_error(p_game_id uuid, p_code text, p_retry text, p_issues jsonb default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('ok',false,'code',p_code,'revision',revision,'sequence',sequence,'retry',p_retry,'issues',p_issues)) from private.games where id=p_game_id;
$$;

create or replace function api.agent_action(p_tool_name text, p_game_id uuid, p_checkpoint_id uuid, p_expected_revision bigint, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g private.games;
  prior private.agent_actions;
  request_hash text;
  expected_tool text;
  publish_result jsonb;
  event_result jsonb;
  action_result jsonb;
  question_id uuid;
  item jsonb;
  seat_value text;
  traits jsonb;
  evidence_id_values bigint[];
  suspicion_record private.suspicions;
  target text;
  decision text;
  reason_value text;
begin
  select * into g from private.games where id=p_game_id for update;
  if g.id is null then raise exception 'INVALID_ROOM'; end if;
  if private.viewer_role(p_game_id)<>'host' then return private.tool_error(p_game_id,'NOT_AUTHORIZED','none'); end if;
  request_hash:=encode(extensions.digest(coalesce(p_payload,'{}')::text,'sha256'),'hex');
  select * into prior from private.agent_actions where game_id=p_game_id and checkpoint_id=p_checkpoint_id and tool_name=p_tool_name;
  if prior.game_id is not null then
    if prior.request_hash=request_hash then return prior.result; end if;
    return private.tool_error(p_game_id,'IDEMPOTENCY_CONFLICT','refresh');
  end if;
  if g.checkpoint_id is distinct from p_checkpoint_id then return private.tool_error(p_game_id,'CHECKPOINT_EXPIRED','refresh'); end if;
  if g.revision<>p_expected_revision then return private.tool_error(p_game_id,'REVISION_CONFLICT','refresh'); end if;
  expected_tool:=case g.checkpoint_kind
    when 'awaiting_learn_questions' then 'propose_learn_questions'
    when 'awaiting_contrast_question' then 'propose_contrast_question'
    when 'awaiting_traits' then 'propose_player_traits'
    when 'awaiting_challenge_question' then 'propose_challenge_question'
    when 'awaiting_suspicion' then 'place_suspicion'
    when 'awaiting_objection_question' then 'propose_objection_question'
    when 'awaiting_objection_resolution' then 'resolve_objection'
    when 'awaiting_accusation' then 'propose_accusation' end;
  if expected_tool is distinct from p_tool_name then return private.tool_error(p_game_id,'INVALID_PHASE','refresh'); end if;

  begin
    if p_tool_name in ('propose_learn_questions','propose_contrast_question','propose_challenge_question','propose_objection_question') then
      if p_tool_name='propose_learn_questions' then
        publish_result:=private.publish_questions(p_game_id,p_checkpoint_id,'learn',p_payload,5,4,null);
      elsif p_tool_name='propose_contrast_question' then
        publish_result:=private.publish_questions(p_game_id,p_checkpoint_id,'contrast',p_payload,1,4,null);
      elsif p_tool_name='propose_challenge_question' then
        publish_result:=private.publish_questions(p_game_id,p_checkpoint_id,'challenge',p_payload,1,4,null);
      else
        select pending_target into target from private.objections where game_id=p_game_id;
        if target is null then raise exception 'INVALID_PHASE'; end if;
        publish_result:=private.publish_questions(p_game_id,p_checkpoint_id,'objection',p_payload,1,3,target);
      end if;
      question_id:=(publish_result->>'firstQuestionId')::uuid;
      perform private.open_question(p_game_id,question_id);
      event_result:=private.emit_event(p_game_id,'detective','question_opened',
        case p_tool_name when 'propose_learn_questions' then 'The Detective opened Learn question 1' when 'propose_contrast_question' then 'The Detective opened a contrast question' when 'propose_challenge_question' then 'The Detective opened the next Challenge' else 'The Detective opened an Objection follow-up' end,
        jsonb_build_object('questionId',question_id,'kind',(select kind from private.game_questions where id=question_id),'ordinal',(select ordinal from private.game_questions where id=question_id)));
    elsif p_tool_name='propose_player_traits' then
      if jsonb_array_length(coalesce(p_payload->'players','[]'))<>2 then raise exception 'INVALID_TRAITS'; end if;
      for item in select * from jsonb_array_elements(p_payload->'players') loop
        seat_value:=item->>'seat'; traits:=item->'traits';
        if seat_value not in ('seat_a','seat_b') or jsonb_array_length(coalesce(traits,'[]'))<>2 then raise exception 'INVALID_TRAITS'; end if;
        evidence_id_values:=private.assert_evidence(p_game_id,item->'evidenceIds',1);
        if exists(select 1 from jsonb_array_elements_text(traits) where char_length(trim(value)) not between 2 and 48 or value~E'[\n\r]') then raise exception 'INVALID_TRAITS'; end if;
        insert into private.player_traits(game_id,seat,ordinal,trait,evidence_ids)
        select p_game_id,seat_value,ordinality,trim(value),evidence_id_values from jsonb_array_elements_text(traits) with ordinality;
      end loop;
      if (select count(*) from private.player_traits where game_id=p_game_id)<>4 then raise exception 'INVALID_TRAITS'; end if;
      update private.games set phase='trait_review',checkpoint_kind=null,checkpoint_id=null,current_question_id=null,current_round_id=null where id=p_game_id;
      event_result:=private.emit_event(p_game_id,'detective','traits_published','The Detective published two traits for each player','{}');
    elsif p_tool_name='place_suspicion' then
      target:=p_payload->>'targetSeat'; reason_value:=trim(p_payload->>'reason'); evidence_id_values:=private.assert_evidence(p_game_id,p_payload->'evidenceIds',1);
      if target not in ('seat_a','seat_b') or char_length(reason_value) not between 2 and 140 then raise exception 'INVALID_SUSPICION'; end if;
      insert into private.suspicions(game_id,round,target_seat,reason,evidence_ids,is_public)
      values(p_game_id,g.round,target,reason_value,evidence_id_values,g.round<>3) returning * into suspicion_record;
      if g.round=3 then
        update private.objections set pending_target=target where game_id=p_game_id;
        update private.games set phase='objection',checkpoint_kind=null,checkpoint_id=null,active_window_id=extensions.gen_random_uuid(),deadline=clock_timestamp()+interval '3 seconds',window_kind='blind_objection' where id=p_game_id;
        event_result:=private.emit_event(p_game_id,'detective','suspicion_staged','The Detective locked a hidden Q3 suspicion','{}');
      elsif g.round<4 then
        update private.games set round=g.round+1,checkpoint_kind='awaiting_challenge_question',checkpoint_id=extensions.gen_random_uuid(),current_question_id=null,current_round_id=null where id=p_game_id;
        event_result:=private.emit_event(p_game_id,'detective','suspicion_placed','The Detective placed suspicion',jsonb_build_object('round',g.round,'targetSeat',target,'reason',reason_value,'evidenceIds',evidence_id_values));
      else
        update private.games set phase='accuse',checkpoint_kind='awaiting_accusation',checkpoint_id=extensions.gen_random_uuid() where id=p_game_id;
        event_result:=private.emit_event(p_game_id,'detective','suspicion_placed','The Detective placed the final suspicion',jsonb_build_object('round',g.round,'targetSeat',target,'reason',reason_value,'evidenceIds',evidence_id_values));
      end if;
    elsif p_tool_name='resolve_objection' then
      decision:=p_payload->>'decision'; reason_value:=trim(p_payload->>'reason'); evidence_id_values:=private.assert_evidence(p_game_id,p_payload->'evidenceIds',1);
      select * into suspicion_record from private.suspicions where game_id=p_game_id and round=3 for update;
      if decision not in ('keep','switch') or suspicion_record.id is null or char_length(reason_value) not between 2 and 140 then raise exception 'INVALID_RESOLUTION'; end if;
      target:=case when decision='keep' then suspicion_record.target_seat when suspicion_record.target_seat='seat_a' then 'seat_b' else 'seat_a' end;
      update private.suspicions set target_seat=target,reason=reason_value,evidence_ids=evidence_id_values,resolution=decision,is_public=true where id=suspicion_record.id;
      update private.games set phase='challenge',round=4,checkpoint_kind='awaiting_challenge_question',checkpoint_id=extensions.gen_random_uuid(),current_question_id=null,current_round_id=null where id=p_game_id;
      event_result:=private.emit_event(p_game_id,'detective','objection_resolved','The Detective resolved the Objection',jsonb_build_object('decision',decision,'targetSeat',target,'reason',reason_value,'evidenceIds',evidence_id_values));
    elsif p_tool_name='propose_accusation' then
      target:=p_payload->>'targetSeat'; reason_value:=trim(p_payload->>'reason'); evidence_id_values:=private.assert_evidence(p_game_id,p_payload->'evidenceIds',2);
      if target not in ('seat_a','seat_b') or char_length(reason_value) not between 2 and 180 then raise exception 'INVALID_ACCUSATION'; end if;
      update private.games set accusation_target=target,accusation_evidence=evidence_id_values,accusation_reason=reason_value,checkpoint_kind=null,checkpoint_id=null,reveal_at=clock_timestamp()+interval '3 seconds',deadline=clock_timestamp()+interval '3 seconds',active_window_id=extensions.gen_random_uuid(),window_kind='accusation' where id=p_game_id;
      event_result:=private.emit_event(p_game_id,'detective','accusation_committed','The Detective committed a final accusation',jsonb_build_object('targetSeat',target,'evidenceIds',evidence_id_values,'reason',reason_value));
    end if;
  exception
    when others then
      if sqlerrm like 'INVALID_QUESTION%' then
        return private.tool_error(p_game_id,'INVALID_QUESTION','revise',jsonb_build_array(jsonb_build_object('path','question','code',split_part(sqlerrm,':',2),'message','Revise the question structure and try again.')));
      elsif sqlerrm='INVALID_EVIDENCE' then return private.tool_error(p_game_id,'INVALID_EVIDENCE','refresh');
      else return private.tool_error(p_game_id,'INVALID_PHASE','refresh'); end if;
  end;

  select * into g from private.games where id=p_game_id;
  action_result:=jsonb_build_object('ok',true,'revision',g.revision,'sequence',g.sequence,'phase',g.phase,'data',coalesce(publish_result,'{}'::jsonb));
  insert into private.agent_actions(game_id,checkpoint_id,tool_name,request_hash,result) values(p_game_id,p_checkpoint_id,p_tool_name,request_hash,action_result);
  return action_result;
end;
$$;

revoke all on all functions in schema api from public, anon;
grant execute on function api.create_game(text,integer) to authenticated;
grant execute on function api.bootstrap_room(text) to authenticated;
grant execute on function api.claim_seat(text,text) to authenticated;
grant execute on function api.set_timer_mode(uuid,integer) to authenticated;
grant execute on function api.set_ready(uuid,boolean) to authenticated;
grant execute on function api.get_public_game_state(uuid) to authenticated;
grant execute on function api.get_player_self_state(uuid) to authenticated;
grant execute on function api.get_events_after(uuid,bigint) to authenticated;
grant execute on function api.submit_answer(uuid,uuid,uuid) to authenticated;
grant execute on function api.submit_trait_feedback(uuid,uuid,text) to authenticated;
grant execute on function api.acknowledge_role(uuid) to authenticated;
grant execute on function api.claim_objection(uuid,uuid) to authenticated;
grant execute on function api.advance_if_due(uuid,uuid) to authenticated;
grant execute on function api.agent_action(text,uuid,uuid,bigint,jsonb) to authenticated;

create policy "game members receive private broadcasts"
on realtime.messages for select to authenticated
using (
  case
    when realtime.topic() ~ '^game:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      then private.is_member((split_part(realtime.topic(), ':', 2))::uuid)
    else false
  end
);
