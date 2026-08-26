import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

assert(url, 'NEXT_PUBLIC_SUPABASE_URL is required');
assert(publishableKey, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required');

function client() {
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function signIn(name) {
  const supabase = client();
  const { error } = await supabase.auth.signInAnonymously();
  assert.equal(error, null, `${name} anonymous sign-in failed: ${error?.message}`);
  return supabase;
}

async function rpc(supabase, name, args) {
  const { data, error } = await supabase.schema('api').rpc(name, args);
  assert.equal(error, null, `${name} failed: ${error?.message}`);
  return data;
}

const questions = [
  ['Which surprise free afternoon sounds most like you?', ['Tiny cafe hunt', 'Long city walk', 'Odd side project', 'Call an old friend']],
  ['What snack vanishes first when you are nearby?', ['Salty crisps', 'Fresh fruit', 'Dark chocolate', 'Spicy noodles']],
  ['How do you usually arrive for a group trip?', ['Very early', 'Right on time', 'Slightly late', 'At the last second']],
  ['What makes a weekend plan worth saying yes to?', ['A great story', 'Maximum comfort', 'Something unfamiliar', 'The right people']],
  ['Which tiny inconvenience tests your patience fastest?', ['Slow walkers', 'Low battery', 'Long menus', 'Missing socks']],
].map(([prompt, options]) => ({ prompt, options }));

const host = await signIn('host');
const playerA = await signIn('player A');
const playerB = await signIn('player B');
const outsider = await signIn('outsider');

const created = await rpc(host, 'create_game', { p_mode: 'standard', p_timer_seconds: 15 });
const gameId = created.publicState.gameId;
const roomCode = created.publicState.roomCode;

assert.equal(created.viewerKind, 'host');
assert.match(roomCode, /^[A-Z2-9]{4}$/);

const joinPreview = await rpc(playerA, 'bootstrap_room', { p_room_code: roomCode });
assert.equal(joinPreview.viewerKind, 'join');
assert.equal(joinPreview.publicState.timeline.length, 0, 'join preview must not expose the host timeline');

const claimedA = await rpc(playerA, 'claim_seat', { p_room_code: roomCode, p_sticker: 'tiger' });
const claimedB = await rpc(playerB, 'claim_seat', { p_room_code: roomCode, p_sticker: 'frog' });
assert.equal(claimedA.viewerKind, 'seat_a');
assert.equal(claimedB.viewerKind, 'seat_b');

await rpc(playerA, 'set_ready', { p_game_id: gameId, p_ready: true });
await rpc(playerB, 'set_ready', { p_game_id: gameId, p_ready: true });

const checkpointState = await rpc(host, 'get_public_game_state', { p_game_id: gameId });
assert.equal(checkpointState.checkpoint.kind, 'awaiting_learn_questions');
assert.deepEqual(checkpointState.eligibleAgentActions, ['propose_learn_questions']);
assert.equal(checkpointState.questionRequest.count, 5);
assert.equal(checkpointState.currentQuestion, null);

const action = await rpc(host, 'agent_action', {
  p_tool_name: 'propose_learn_questions',
  p_game_id: gameId,
  p_checkpoint_id: checkpointState.checkpoint.id,
  p_expected_revision: checkpointState.revision,
  p_payload: { questions },
});
assert.equal(action.ok, true);
assert.equal(action.data.acceptedCount, 5);

const publicAfterQuestion = await rpc(host, 'get_public_game_state', { p_game_id: gameId });
assert.equal(publicAfterQuestion.currentQuestion.ordinal, 1);
assert.equal('options' in publicAfterQuestion.currentQuestion, false, 'public projection must not contain options');
assert.equal(publicAfterQuestion.timeline.some((event) => JSON.stringify(event).includes('Tiny cafe hunt')), false, 'queued choices must not leak into events');

const selfA = await rpc(playerA, 'get_player_self_state', { p_game_id: gameId });
const selfB = await rpc(playerB, 'get_player_self_state', { p_game_id: gameId });
assert.equal(selfA.canAnswer, true);
assert.equal(selfB.canAnswer, true);
assert.equal(selfA.options.length, 4);
assert.equal(selfB.options.length, 4);
assert.deepEqual(
  (await rpc(playerA, 'get_player_self_state', { p_game_id: gameId })).options,
  selfA.options,
  'option order must be stable across refreshes',
);

const outsiderState = await outsider.schema('api').rpc('get_public_game_state', { p_game_id: gameId });
assert(outsiderState.error, 'an unrelated anonymous user must not read the game');

const privateRead = await outsider.schema('private').from('games').select('id').limit(1);
assert(privateRead.error, 'the private schema must not be exposed through the Data API');

console.log(JSON.stringify({
  ok: true,
  gameId,
  roomCode,
  revision: publicAfterQuestion.revision,
  sequence: publicAfterQuestion.sequence,
  checks: [
    'anonymous-auth',
    'three-member-room',
    'learn-checkpoint',
    'five-question-atomic-write',
    'public-private-projections',
    'stable-option-order',
    'outsider-denied',
    'private-schema-hidden',
  ],
}, null, 2));
