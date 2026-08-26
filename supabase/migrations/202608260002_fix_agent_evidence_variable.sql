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
