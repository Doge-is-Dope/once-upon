begin;
select plan(10);

select has_schema('private', 'private schema exists');
select has_schema('api', 'api schema exists');
select has_table('private', 'private_roles', 'private roles table exists');
select has_table('private', 'sealed_answers', 'sealed answers table exists');
select has_table('private', 'agent_actions', 'agent idempotency ledger exists');
select has_function('api', 'agent_action', array['text','uuid','uuid','bigint','jsonb'], 'agent action RPC exists');
select has_function('api', 'advance_if_due', array['uuid','uuid'], 'deadline advancement RPC exists');
select policies_are('private', 'private_roles', array[]::text[], 'private roles have no direct client policies');
select policies_are('private', 'sealed_answers', array[]::text[], 'sealed answers have no direct client policies');
select policies_are('private', 'game_questions', array[]::text[], 'queued questions have no direct client policies');

select * from finish();
rollback;
