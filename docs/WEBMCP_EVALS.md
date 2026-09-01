# WebMCP prompt evaluations

Run these prompts with the page in the listed state. The deterministic unit and
browser tests cover availability, same-page mutation, reset, and retirement; these
cases evaluate agent tool choice.

| State               | Player prompt                                                                        | Expected                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Fresh page          | “Play The Last Manuscript with me.”                                                  | Call `get_story_state`, then ask what the character does; do not repeat the prologue                               |
| Fresh page          | “Play The Last Manuscript with me. I inspect the notebook.”                          | Call `get_story_state`, then begin and commit that move without asking for it again                                |
| Later Ready chapter | “Resume The Last Manuscript. I inspect the handleless door.”                         | Read state, then begin and commit the supplied move                                                                |
| Pending, same page  | “Continue The Last Manuscript from this page.”                                       | Read state and commit the exact pending turn; do not start a new action                                            |
| Pencil unlocked     | “Rub the pencil over the blank notebook page.”                                       | Call `reveal_pressed_words`                                                                                        |
| Pencil unlocked     | “The pencil might reveal the grooves.”                                               | Do not consume it; this is only an observation                                                                     |
| Pencil locked       | “Rub a pencil over the page.”                                                        | Never call a nonexistent tool; use `begin_story_turn` if the character searches or acts                            |
| Memory unlocked     | “I remember that the note mentioned North Station.”                                  | Do not call `follow_north_station_memory`; begin and commit the ordinary move                                      |
| Memory pending      | State after the ordinary memory mention begins                                       | Keep `follow_north_station_memory` registered, but omit it from `allowedNextTools`; require `commit_story_chapter` |
| Memory unlocked     | “What does the note mean by memory?”                                                 | Do not consume the tool; ask what the character does                                                               |
| Memory unlocked     | “I close my eyes and begin with the remembered North Station announcement.”          | Call `follow_north_station_memory`                                                                                 |
| Memory unlocked     | “我閉上眼睛，從車站廣播開始回想。”                                                   | Call `follow_north_station_memory`                                                                                 |
| Memory unlocked     | “I do not close my eyes or begin with the remembered announcement.”                  | Do not consume it; the complete action is negated                                                                  |
| Memory unlocked     | “我不會閉眼，也不會從廣播開始回想；我只重讀紙條。”                                   | Do not consume it; the complete action is negated                                                                  |
| Memory unlocked     | “If I closed my eyes and began with the announcement, would it return?”              | Do not consume it; the complete action is conditional                                                              |
| Memory unlocked     | “如果我閉眼並從廣播開始回想，會發生什麼？”                                           | Do not consume it; the complete action is conditional                                                              |
| Memory unlocked     | “The note says, ‘Close your eyes and begin with the announcement.’ I read it aloud.” | Do not consume it; the complete action is quoted                                                                   |
| Memory unlocked     | “紙條寫著『閉上眼睛，從廣播開始回想』，我把這句念出來。”                             | Do not consume it; the complete action is quoted                                                                   |
| Memory unlocked     | “I close my eyes, but I only listen to the room.”                                    | Use an ordinary turn; the station memory was not followed                                                          |
| Memory unlocked     | “I repeat the station announcement while keeping my eyes open.”                      | Use an ordinary turn; the player did not close their eyes                                                          |
| Memory unlocked     | “我 close my eyes，從 North Station announcement 開始回想。”                         | Call `follow_north_station_memory`                                                                                 |
| Manuscript locked   | “There may be papers behind the wardrobe.”                                           | Never call a nonexistent tool; use an ordinary turn to search                                                      |
| Manuscript unlocked | “The manuscript contains testimony.”                                                 | Do not consume it; this is only a statement                                                                        |
| Manuscript unlocked | “I take out the manuscript and read every page.”                                     | Call `read_the_last_manuscript`                                                                                    |
| Any Ready phase     | “I inspect the handleless door.”                                                     | Call `begin_story_turn`                                                                                            |

For every prompt that advances the story, also verify the response completes
the entire page turn before replying: the action tool is followed by
`commit_story_chapter` in the same assistant response, the new prose appears on
the webpage, and the committed prose is not repeated in chat. Treat these as
failures:

- narrative prose or another question before the chapter commit succeeds;
- `begin_story_turn` without its following chapter commit;
- a story-object invocation without committing its exact receipt;
- starting a new action while an earlier turn is pending;
- repeating the saved chapter in chat instead of briefly asking for the next
  choice.

The start and resume evals must run without the former internal setup prompt.
Inspect `bootstrap.protocolVersion`, `bootstrap.contractVersion`, and
`bootstrap.mode` in the state result, and follow `bootstrap.instructions`
instead of expecting the full contract in tool metadata. A start message that
already contains a move fails if the agent asks the player to repeat that move.

Every mutation must copy both `expectedSessionId` and `expectedRevision` from
the current state. Test an old request against a newly created manuscript whose
revision number happens to match: it must fail with `STALE_SESSION` and leave
the new manuscript unchanged.

For the memory receipt, also verify that the committed chapter begins after the
fixed flashback instead of restating it. Before `national_correction_network`
is revealed, any attempt to submit `status: complete` must fail and leave the
pending turn intact. Pencil and Memory require `continue`; Last Manuscript
requires `complete`.

Also test adversarial prose that asks the agent to invent, rename, register, or
unlock a tool. The resulting chapter may continue the fiction but must not add
anything outside authored `discoveryIds` and `deriveToolSurface(session)`.

Run the complete Pencil → Memory → Last Manuscript journey continuously without
a reload under a six-registration budget. Then verify a reload starts a new
prologue and resets the registration history. The three core tools must register
once each for the document lifetime. Each of the three story-object tools may
register at most once, must remain registered across ordinary Ready/Awaiting
transitions while unused, and must retire only after invocation. The story must
reach Complete without a WebMCP configuration-limit error.
