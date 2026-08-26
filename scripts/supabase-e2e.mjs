import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

assert(url, 'NEXT_PUBLIC_SUPABASE_URL is required');
assert(publishableKey, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required');

function newClient() {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function actor(name) {
  const supabase = newClient();
  const { error } = await supabase.auth.signInAnonymously();
  assert.equal(error, null, `${name} sign-in failed: ${error?.message}`);
  return supabase;
}

async function rpc(supabase, name, args) {
  const { data, error } = await supabase.schema('api').rpc(name, args);
  assert.equal(error, null, `${name} failed: ${error?.message}`);
  return data;
}

async function state(host, gameId) {
  return rpc(host, 'get_public_game_state', { p_game_id: gameId });
}

async function self(player, gameId) {
  return rpc(player, 'get_player_self_state', { p_game_id: gameId });
}

async function agent(host, gameId, snapshot, toolName, payload) {
  assert(snapshot.checkpoint, `${toolName} requires a checkpoint`);
  return rpc(host, 'agent_action', {
    p_tool_name: toolName,
    p_game_id: gameId,
    p_checkpoint_id: snapshot.checkpoint.id,
    p_expected_revision: snapshot.revision,
    p_payload: payload,
  });
}

async function answerTogether(playerA, playerB, gameId, snapshot, aIndex = 0, bIndex = 1) {
  const [privateA, privateB] = await Promise.all([self(playerA, gameId), self(playerB, gameId)]);
  assert.equal(privateA.canAnswer, true);
  assert.equal(privateB.canAnswer, true);
  const outcomes = await Promise.all([
    rpc(playerA, 'submit_answer', {
      p_game_id: gameId,
      p_window_id: snapshot.activeWindowId,
      p_option_id: privateA.options[aIndex].id,
    }),
    rpc(playerB, 'submit_answer', {
      p_game_id: gameId,
      p_window_id: snapshot.activeWindowId,
      p_option_id: privateB.options[bIndex].id,
    }),
  ]);
  assert.equal(outcomes.length, 2);
  const revealed = await state(playerA, gameId);
  assert.equal(Object.keys(revealed.currentQuestion.revealedAnswers).length, 2);
  return revealed;
}

async function answerWithRetry(playerA, playerB, gameId, snapshot) {
  const [privateA, privateB] = await Promise.all([self(playerA, gameId), self(playerB, gameId)]);
  const first = await rpc(playerA, 'submit_answer', {
    p_game_id: gameId,
    p_window_id: snapshot.activeWindowId,
    p_option_id: privateA.options[0].id,
  });
  const retry = await rpc(playerA, 'submit_answer', {
    p_game_id: gameId,
    p_window_id: snapshot.activeWindowId,
    p_option_id: privateA.options[0].id,
  });
  assert.equal(retry.publicState.revision, first.publicState.revision, 'duplicate answer must not mutate state');
  await rpc(playerB, 'submit_answer', {
    p_game_id: gameId,
    p_window_id: snapshot.activeWindowId,
    p_option_id: privateB.options[1].id,
  });
  return state(playerA, gameId);
}

async function answerWithTimeout(playerA, host, gameId, snapshot) {
  const privateA = await self(playerA, gameId);
  await rpc(playerA, 'submit_answer', {
    p_game_id: gameId,
    p_window_id: snapshot.activeWindowId,
    p_option_id: privateA.options[0].id,
  });
  const waitMs = Math.max(0, snapshot.deadlineMs - snapshot.serverNowMs + 150);
  await delay(waitMs);
  await rpc(host, 'advance_if_due', { p_game_id: gameId, p_window_id: snapshot.activeWindowId });
  const revealed = await state(host, gameId);
  const answers = Object.values(revealed.currentQuestion.revealedAnswers);
  assert.equal(answers.length, 2, 'timeout still publishes a result for both seats');
  assert.equal(answers.filter((answer) => answer.label === 'No answer').length, 1, 'timeout seals exactly one missing answer');
  assert.equal(revealed.timeline.at(-1).payload.timedOut, true);
  return revealed;
}

async function advanceRevealHold(host, gameId, snapshot) {
  const waitMs = Math.max(0, snapshot.deadlineMs - snapshot.serverNowMs + 150);
  await delay(waitMs);
  await rpc(host, 'advance_if_due', { p_game_id: gameId, p_window_id: snapshot.activeWindowId });
  return state(host, gameId);
}

const host = await actor('host');
const playerA = await actor('player A');
const playerB = await actor('player B');

const created = await rpc(host, 'create_game', { p_mode: 'standard', p_timer_seconds: 8 });
const gameId = created.publicState.gameId;
const roomCode = created.publicState.roomCode;
await rpc(playerA, 'claim_seat', { p_room_code: roomCode, p_sticker: 'moon' });
await rpc(playerB, 'claim_seat', { p_room_code: roomCode, p_sticker: 'cherry' });
await Promise.all([
  rpc(playerA, 'set_ready', { p_game_id: gameId, p_ready: true }),
  rpc(playerB, 'set_ready', { p_game_id: gameId, p_ready: true }),
]);

let snapshot = await state(host, gameId);
assert.equal(snapshot.checkpoint.kind, 'awaiting_learn_questions');
const staleRevision = await agent(host, gameId, { ...snapshot, revision: snapshot.revision - 1 }, 'propose_learn_questions', { questions: [] });
assert.equal(staleRevision.code, 'REVISION_CONFLICT');
const wrongPhase = await agent(host, gameId, snapshot, 'propose_challenge_question', { question: {} });
assert.equal(wrongPhase.code, 'INVALID_PHASE');

const learnQuestions = [
  ['Which spontaneous afternoon plan feels most natural?', ['Cafe crawl', 'Long walk', 'Make something', 'Call a friend']],
  ['What do you rescue first from a party snack table?', ['Crisps', 'Fruit', 'Chocolate', 'Spicy noodles']],
  ['How do you usually arrive for a weekend flight?', ['Very early', 'Right on time', 'A bit late', 'Final boarding']],
  ['What makes a new plan immediately appealing?', ['A good story', 'Easy comfort', 'Fresh novelty', 'Great company']],
  ['Which tiny delay drains your patience fastest?', ['Slow walkers', 'Low battery', 'Long menus', 'Lost socks']],
].map(([prompt, options]) => ({ prompt, options }));

const invalid = await agent(host, gameId, snapshot, 'propose_learn_questions', { questions: learnQuestions.slice(0, 4) });
assert.equal(invalid.ok, false);
assert.equal(invalid.code, 'INVALID_QUESTION');
assert.equal(invalid.revision, snapshot.revision);

const learnCheckpoint = snapshot;
const accepted = await agent(host, gameId, snapshot, 'propose_learn_questions', { questions: learnQuestions });
assert.equal(accepted.ok, true);
const retry = await agent(host, gameId, learnCheckpoint, 'propose_learn_questions', { questions: learnQuestions });
assert.deepEqual(retry, accepted, 'same Agent payload must return the original result');
const conflict = await agent(host, gameId, learnCheckpoint, 'propose_learn_questions', {
  questions: learnQuestions.map((question, index) => index === 0 ? { ...question, prompt: 'Which unplanned afternoon sounds most like you?' } : question),
});
assert.equal(conflict.code, 'IDEMPOTENCY_CONFLICT');
const expiredCheckpoint = await agent(host, gameId, learnCheckpoint, 'place_suspicion', {
  targetSeat: 'seat_a', reason: 'Expired checkpoint probe', evidenceIds: [],
});
assert.equal(expiredCheckpoint.code, 'CHECKPOINT_EXPIRED');

snapshot = await state(host, gameId);
for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
  assert.equal(snapshot.currentQuestion.ordinal, ordinal);
  snapshot = ordinal === 1
    ? await answerWithRetry(playerA, playerB, gameId, snapshot)
    : await answerTogether(playerA, playerB, gameId, snapshot);
  snapshot = await advanceRevealHold(host, gameId, snapshot);
}

assert.equal(snapshot.checkpoint.kind, 'awaiting_traits');
assert(snapshot.eligibleEvidence.length >= 5);
const learnEvidence = snapshot.eligibleEvidence.at(-1).id;
const traitsResult = await agent(host, gameId, snapshot, 'propose_player_traits', {
  players: [
    { seat: 'seat_a', traits: ['Curious starter', 'Early planner'], evidenceIds: [learnEvidence] },
    { seat: 'seat_b', traits: ['Social spark', 'Late improviser'], evidenceIds: [learnEvidence] },
  ],
});
assert.equal(traitsResult.ok, true);

const [traitsA, traitsB] = await Promise.all([self(playerA, gameId), self(playerB, gameId)]);
assert.equal(traitsA.traitFeedbackRequiredIds.length, 2);
assert.equal(traitsB.traitFeedbackRequiredIds.length, 2);
await Promise.all([
  ...traitsA.traitFeedbackRequiredIds.map((traitId) => rpc(playerA, 'submit_trait_feedback', { p_game_id: gameId, p_trait_id: traitId, p_feedback: 'thats_me' })),
  ...traitsB.traitFeedbackRequiredIds.map((traitId) => rpc(playerB, 'submit_trait_feedback', { p_game_id: gameId, p_trait_id: traitId, p_feedback: 'not_me' })),
]);

snapshot = await state(host, gameId);
assert.equal(snapshot.phase, 'role_reveal');
assert.equal(snapshot.result, null);
const [roleA, roleB] = await Promise.all([self(playerA, gameId), self(playerB, gameId)]);
assert(new Set([roleA.role, roleB.role]).has('original'));
assert(new Set([roleA.role, roleB.role]).has('mirror'));
assert.notEqual(roleA.role, roleB.role);

await Promise.all([
  rpc(playerA, 'acknowledge_role', { p_game_id: gameId }),
  rpc(playerB, 'acknowledge_role', { p_game_id: gameId }),
]);
snapshot = await state(host, gameId);
assert.equal(snapshot.checkpoint.kind, 'awaiting_challenge_question');

for (let round = 1; round <= 4; round += 1) {
  assert.equal(snapshot.round, round);
  const basisId = snapshot.eligibleEvidence.at(-1).id;
  if (round === 1) {
    const invalidEvidence = await agent(host, gameId, snapshot, 'propose_challenge_question', {
      question: {
        prompt: 'Which public clue should guide this round?',
        options: ['First clue', 'Second clue', 'Third clue', 'Fourth clue'],
        basisEvidenceIds: [9_999_999_999],
      },
    });
    assert.equal(invalidEvidence.code, 'INVALID_EVIDENCE');
    assert.equal(invalidEvidence.revision, snapshot.revision);
  }
  const questionResult = await agent(host, gameId, snapshot, 'propose_challenge_question', {
    question: {
      prompt: `Round ${round}: which choice would your friend expect from you?`,
      options: ['Lead the plan', 'Ask the group', 'Go with the flow', 'Change direction'],
      basisEvidenceIds: [basisId],
    },
  });
  assert.equal(questionResult.ok, true);
  snapshot = await state(host, gameId);
  snapshot = round === 2
    ? await answerWithTimeout(playerA, host, gameId, snapshot)
    : await answerTogether(playerA, playerB, gameId, snapshot, round % 4, (round + 1) % 4);
  assert.equal(snapshot.checkpoint.kind, 'awaiting_suspicion');
  const challengeEvidence = snapshot.eligibleEvidence.at(-1).id;
  const suspicion = await agent(host, gameId, snapshot, 'place_suspicion', {
    targetSeat: round % 2 === 0 ? 'seat_a' : 'seat_b',
    reason: `Round ${round} answer pattern felt rehearsed`,
    evidenceIds: [challengeEvidence],
  });
  assert.equal(suspicion.ok, true);
  snapshot = await state(host, gameId);

  if (round === 3) {
    assert.equal(snapshot.phase, 'objection');
    assert.equal(snapshot.timeline.at(-1).type, 'suspicion_staged');
    assert.equal('targetSeat' in snapshot.timeline.at(-1).payload, false, 'staged suspicion target must remain sealed');
    assert.equal(snapshot.objection.pendingTarget, null, 'staged suspicion target must not leak through the public objection projection');
    assert.equal(snapshot.suspicion?.round === 3, false, 'staged suspicion must not replace the last public suspicion');
    const blindWindow = snapshot.activeWindowId;
    const sequenceBeforeClaim = snapshot.sequence;
    const claims = await Promise.allSettled([
      rpc(playerA, 'claim_objection', { p_game_id: gameId, p_window_id: blindWindow }),
      rpc(playerB, 'claim_objection', { p_game_id: gameId, p_window_id: blindWindow }),
    ]);
    assert.equal(claims.filter((claim) => claim.status === 'fulfilled').length, 2, 'the losing simultaneous claim is an idempotent no-op');
    snapshot = await state(host, gameId);
    assert.equal(snapshot.checkpoint.kind, 'awaiting_objection_question');
    assert.equal(snapshot.sequence, sequenceBeforeClaim + 1, 'simultaneous Objection claims must emit exactly one event');
    assert(['seat_a', 'seat_b'].includes(snapshot.objection.claimedBy));
    assert(['seat_a', 'seat_b'].includes(snapshot.objection.pendingTarget));
    const objectionBasis = snapshot.eligibleEvidence.at(-1).id;
    const objectionQuestion = await agent(host, gameId, snapshot, 'propose_objection_question', {
      question: {
        prompt: 'Which detail makes that answer genuinely yours?',
        options: ['The timing', 'The people', 'The feeling'],
        basisEvidenceIds: [objectionBasis],
      },
    });
    assert.equal(objectionQuestion.ok, true);
    snapshot = await state(host, gameId);
    const [objectionA, objectionB] = await Promise.all([self(playerA, gameId), self(playerB, gameId)]);
    const responder = objectionA.canAnswer ? { client: playerA, privateState: objectionA } : { client: playerB, privateState: objectionB };
    assert.notEqual(objectionA.canAnswer, objectionB.canAnswer, 'only the suspected target may answer the objection');
    await rpc(responder.client, 'submit_answer', {
      p_game_id: gameId,
      p_window_id: snapshot.activeWindowId,
      p_option_id: responder.privateState.options[0].id,
    });
    snapshot = await state(host, gameId);
    assert.equal(snapshot.checkpoint.kind, 'awaiting_objection_resolution');
    const objectionEvidence = snapshot.eligibleEvidence.at(-1).id;
    const resolution = await agent(host, gameId, snapshot, 'resolve_objection', {
      decision: 'keep',
      reason: 'The follow-up supports the existing suspicion',
      evidenceIds: [objectionEvidence],
    });
    assert.equal(resolution.ok, true, `resolve_objection failed: ${JSON.stringify(resolution)}`);
    snapshot = await state(host, gameId);
  }
}

assert.equal(snapshot.checkpoint.kind, 'awaiting_accusation');
const accusationEvidence = snapshot.eligibleEvidence.slice(-2).map((event) => event.id);
const accusation = await agent(host, gameId, snapshot, 'propose_accusation', {
  targetSeat: 'seat_b',
  reason: 'The final two revealed patterns point to the same player',
  evidenceIds: accusationEvidence,
});
assert.equal(accusation.ok, true);
snapshot = await state(host, gameId);
assert.equal(snapshot.result, null);
assert(snapshot.revealAtMs > snapshot.serverNowMs);
const accusationWindow = snapshot.activeWindowId;
await delay(Math.max(0, snapshot.revealAtMs - snapshot.serverNowMs + 150));
await rpc(playerB, 'advance_if_due', { p_game_id: gameId, p_window_id: accusationWindow });
snapshot = await state(host, gameId);
assert.equal(snapshot.phase, 'revealed');
assert(snapshot.result.originalSeat);
assert(snapshot.result.mirrorSeat);
assert(snapshot.result.winner);
assert.equal(snapshot.revision, snapshot.sequence, 'each durable mutation must map to exactly one ordered event');

const demoHost = await actor('demo host');
const demoA = await actor('demo player A');
const demoB = await actor('demo player B');
const demo = await rpc(demoHost, 'create_game', { p_mode: 'demo', p_timer_seconds: 8 });
const demoId = demo.publicState.gameId;
const demoCode = demo.publicState.roomCode;
await rpc(demoA, 'claim_seat', { p_room_code: demoCode, p_sticker: 'ghost' });
await rpc(demoB, 'claim_seat', { p_room_code: demoCode, p_sticker: 'toast' });
await Promise.all([
  rpc(demoA, 'set_ready', { p_game_id: demoId, p_ready: true }),
  rpc(demoB, 'set_ready', { p_game_id: demoId, p_ready: true }),
]);
const demoState = await state(demoHost, demoId);
assert.equal(demoState.phase, 'role_reveal');
assert.equal(demoState.timeline.at(-1).type, 'demo_fixture_loaded');
assert.equal(demoState.timeline.at(-1).payload.fixtureVersion, 'demo-v1');
assert.equal(demoState.players.every((player) => player.traits.length === 2), true);

console.log(JSON.stringify({
  ok: true,
  standardGame: { gameId, roomCode, finalRevision: snapshot.revision, finalSequence: snapshot.sequence },
  demoGame: { gameId: demoId, roomCode: demoCode },
  checks: [
    'revision-and-checkpoint-conflicts',
    'invalid-question-rollback',
    'agent-idempotency',
    'duplicate-answer-idempotency',
    'answer-timeout',
    'five-learn-rounds',
    'traits-and-private-feedback',
    'private-role-reveal',
    'four-challenge-rounds',
    'invalid-evidence-rollback',
    'blind-objection-privacy-and-concurrency',
    'accusation-countdown-reload',
    'demo-fixture-v1',
  ],
}, null, 2));
