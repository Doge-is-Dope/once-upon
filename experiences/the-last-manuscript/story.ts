import type { StoryDefinition } from '@/lib/runtime/types';

export const lastManuscriptStory: StoryDefinition = {
  id: 'last-manuscript-living-v4',
  narration: 'record',
  prologue: {
    title: 'The question at 5:41',
    prose:
      '“Please answer: What happened at North Station at 5:41 p.m. on May twelfth?”\n\nThe question wakes you at a table. A desk lamp shines across an open notepad. Its top page has been torn away, leaving a ragged edge in the binding. A bed stands against one wall. Beside it are a sink, a wardrobe, and the room’s only door. The door has no handle.\n\nThe speaker set into the wall repeats the question. You know North Station should mean something to you, but no answer follows. You cannot remember why you are here.\n\nThe ventilation starts. Something taps twice against the wall behind the wardrobe, then falls still.',
    recordProse:
      '“Please answer: What happened at North Station at 5:41 p.m. on May twelfth?”\n\nThe question wakes the subject at a table. A desk lamp shines across an open notepad. Its top page has been torn away, leaving a ragged edge in the binding. A bed stands against one wall. Beside it are a sink, a wardrobe, and the room’s only door. The door has no handle.\n\nThe speaker set into the wall repeats the question. The subject knows North Station should mean something to the subject, but no answer follows. The subject cannot remember why the subject is here.\n\nThe ventilation starts. Something taps twice against the wall behind the wardrobe, then falls still.',
    continuitySummary:
      'You woke at a table in a single room while a wall speaker asked what happened at North Station at 5:41 p.m. on May twelfth. The room contains a torn notepad, a bed, a sink, a wardrobe, and a door with no handle. You know North Station should mean something to you, but no answer returns. When the ventilation runs, something taps behind the wardrobe.',
  },
  clues: [
    {
      id: 'torn-page',
      title: 'The Torn Page',
      observation:
        'The top sheet is gone. A ragged strip remains in the binding, and the page beneath it is indented.',
      revealedBy: { kind: 'prologue' },
    },
    {
      id: 'behind-wardrobe',
      title: 'Behind the Wardrobe',
      observation:
        'The tapping begins with the ventilation and stops when it does. It comes from the narrow gap behind the wardrobe.',
      revealedBy: { kind: 'prologue' },
      lead: {
        text: 'Move the wardrobe aside and search the narrow gap where the tapping came from.',
        target: { kind: 'discovery', id: 'manuscript_found' },
      },
    },
    {
      id: 'pencil',
      title: 'The Pencil',
      observation:
        'Freshly sharpened. Left just beneath the desk, where I could reach it.',
      revealedBy: { kind: 'discovery', id: 'pencil_found' },
      lead: {
        text: 'Turn the pencil sideways and shade across the shallow grooves on the blank page.',
        target: { kind: 'interaction', id: 'pressed_writing' },
      },
    },
    {
      id: 'impressed-note',
      title: 'The Impressed Note',
      observation:
        'The missing page left a message in the paper beneath it: “Sixth time. Don’t answer yet.” It tells me to start with the announcement, look behind the wardrobe, and read all the papers first.',
      revealedBy: { kind: 'fact', id: 'sixth_attempt_note' },
      lead: {
        text: 'Close my eyes and begin with the North Station announcement.',
        target: { kind: 'interaction', id: 'north_station_memory' },
      },
    },
    {
      id: 'returned-memory',
      title: 'The Returned Memory',
      observation:
        'At 5:41, the east gate was already descending. The first shot came before any smoke. The room’s approved story does not match what I remember.',
      revealedBy: { kind: 'fact', id: 'north_station_flashback' },
    },
    {
      id: 'sewn-manuscript',
      title: 'The Sewn Manuscript',
      observation:
        'Pages from different forms have been sewn into one volume. It was hidden behind the wardrobe, where the tapping came from.',
      revealedBy: { kind: 'discovery', id: 'manuscript_found' },
      lead: {
        text: 'Open the sewn volume and read all the papers before deciding what to tell the speaker.',
        target: { kind: 'interaction', id: 'last_manuscript' },
      },
    },
  ],
  completionPassage: {
    prose:
      'The elevator descends without stopping. Its doors open onto a narrow service lane wet with rain. No alarm follows you. No footsteps come after you.\n\nBy the next corner, the manuscript is hidden beneath your coat and the building looks like any other office after dark. You keep walking.',
    recordProse:
      'The elevator descends without stopping. Its doors open onto a narrow service lane wet with rain. No alarm follows the subject. No footsteps come after the subject.\n\nBy the next corner, the manuscript is hidden beneath the subject’s coat and the building looks like any other office after dark. The subject continues walking.',
  },
  discoveryIds: ['pencil_found', 'manuscript_found'],
  discoveryRequirements: [
    {
      id: 'manuscript_found',
      requiredInteractionIds: ['north_station_memory'],
      requiredFactIds: ['north_station_flashback'],
    },
  ],
  completionRequiredFactIds: ['national_correction_network'],
  interactions: [
    {
      id: 'pressed_writing',
      toolName: 'reveal_pressed_words',
      title: 'The Pencil',
      description:
        'Rub the discovered pencil across the notepad only when the player explicitly asks to reveal the impressions left by the missing page.',
      cue: 'Faint grooves cross the blank page. The side of the pencil can make them legible.',
      announcement: 'The pencil has raised words on the notepad.',
      requiredDiscoveryIds: ['pencil_found'],
      requiredInteractionIds: [],
      requiredFactIds: [],
      sealedFacts: [
        {
          id: 'sixth_attempt_note',
          value:
            'Sixth time.\nDon’t answer yet.\nClose your eyes. Start with the announcement.\nBehind the wardrobe.\nRead all the papers first.\n\nThere is no signature. The note does not explain who wrote it or what the papers are.',
          recordValue:
            'Sixth time.\nThe subject must not answer yet.\nThe subject must close their eyes and start with the announcement.\nBehind the wardrobe.\nThe subject must read all the papers first.\n\nThere is no signature. The note does not explain who wrote it or what the papers are.',
          protectedTerms: [
            'Sixth time',
            'Start with the announcement',
            'Read all the papers first',
          ],
        },
      ],
      presentation: 'pressed_writing',
      completionPolicy: 'must_continue',
    },
    {
      id: 'north_station_memory',
      toolName: 'follow_north_station_memory',
      title: 'The North Station Memory',
      description:
        'Follow the broken North Station memory only when the player explicitly chooses to close their eyes and begin with the remembered announcement. This is a memory, not a recording or an answer from the room.',
      cue: 'The note offers a way into the broken memory: close your eyes and begin with the station announcement.',
      requiredDiscoveryIds: [],
      requiredInteractionIds: ['pressed_writing'],
      requiredFactIds: ['sixth_attempt_note'],
      sealedFacts: [
        {
          id: 'north_station_flashback',
          value:
            'You close your eyes and begin with the announcement. Two short tones sound before a voice directs everyone toward the east exit and tells them not to run.\n\nThe clock above the concourse reads 5:41. The east gate is already descending. The crowd presses toward it as the metal reaches the floor, then turns toward the platforms. The shutters along that route are already down.\n\nThe first shot sounds before there is any smoke. More shots follow. Smoke comes later.',
          recordValue:
            'The subject closes their eyes and begins with the announcement. Two short tones sound before a voice directs everyone toward the east exit and tells them not to run.\n\nThe clock above the concourse reads 5:41. The east gate is already descending. The crowd presses toward it as the metal reaches the floor, then turns toward the platforms. The shutters along that route are already down.\n\nThe first shot sounds before there is any smoke. More shots follow. Smoke comes later.',
          protectedTerms: [
            'The shutters along that route are already down',
            'The first shot sounds before there is any smoke',
            'Smoke comes later',
          ],
        },
        {
          id: 'approved_north_station_account',
          value:
            'When you open your eyes, the table, notepad, and handleless door have not changed. The wall speaker is still waiting. It states the approved version: “An equipment fire occurred. The evacuation was successful. No one died.” Then it asks you to repeat it. If you repeat those words exactly, the speaker answers, “Words correct. Memory response inconsistent.” The door remains closed.',
          recordValue:
            'When the subject opens their eyes, the table, notepad, and handleless door have not changed. The wall speaker is still waiting. It states the approved version: “An equipment fire occurred. The evacuation was successful. No one died.” Then it asks the subject to repeat it. If the subject repeats those words exactly, the speaker answers, “Words correct. Memory response inconsistent.” The door remains closed.',
          protectedTerms: [
            'An equipment fire occurred',
            'Words correct. Memory response inconsistent',
          ],
        },
      ],
      presentation: 'memory_flashback',
      completionPolicy: 'must_continue',
    },
    {
      id: 'last_manuscript',
      toolName: 'read_the_last_manuscript',
      title: 'The Last Manuscript',
      description:
        'Read the sewn papers found behind the wardrobe only when the player explicitly asks to open or examine them. Carry every revealed fact into the next chapter.',
      cue: 'Pages taken from different forms have been sewn into one volume. The note asked you to read all of them before deciding what to say.',
      announcement: 'The door has opened onto the corridor.',
      requiredDiscoveryIds: ['manuscript_found'],
      requiredInteractionIds: ['north_station_memory'],
      requiredFactIds: ['north_station_flashback'],
      sealedFacts: [
        {
          id: 'north_station_testimonies',
          value:
            'The sewn pages carry the same North Station case number but different handwriting. A station record says the east gate received its order to close before the fire alert. A passenger writes that the shots came before the smoke. An emergency form lists gunshot wounds; its linked medical record later calls them smoke inhalation. The accounts differ at the edges but agree on the sequence. At the bottom of each page, repeated evaluations gradually replace the original account with the same sentence: “An equipment fire occurred. The evacuation was successful. No one died.” The final version is stamped CONSISTENT. Archive marks show that witnesses wrote these sheets during separate evaluations and that the sheets were later confiscated into separate case files. An unknown person with archive access removed them, arranged them, and sewed them into this volume. Nothing in the manuscript identifies that person or explains their motive or fate.',
          recordValue:
            'The sewn pages carry the same North Station case number but different handwriting. A station record says the east gate received its order to close before the fire alert. A passenger writes that the shots came before the smoke. An emergency form lists gunshot wounds; its linked medical record later calls them smoke inhalation. The accounts differ at the edges but agree on the sequence. At the bottom of each page, repeated evaluations gradually replace the original account with the same sentence: “An equipment fire occurred. The evacuation was successful. No one died.” The final version is stamped CONSISTENT. Archive marks show that witnesses wrote these sheets during separate evaluations and that the sheets were later confiscated into separate case files. An unknown person with archive access removed them, arranged them, and sewed them into this volume. Nothing in the manuscript identifies that person or explains their motive or fate.',
          protectedTerms: ['stamped CONSISTENT', 'lists gunshot wounds'],
        },
        {
          id: 'memory_correction_protocol',
          value:
            'The forms show what the room is for. A person is not released for agreeing to repeat the approved version. The evaluations continue until the approved version has replaced what that person remembers. Each completed page ends with CONSISTENT.',
          recordValue:
            'The forms show what the room is for. A person is not released for agreeing to repeat the approved version. The evaluations continue until the approved version has replaced what that person remembers. Each completed page ends with CONSISTENT.',
          protectedTerms: ['replaced what that person remembers'],
        },
        {
          id: 'last_unmodified_witness',
          value:
            'Near the end is an unsigned form for Room Seven. Six evaluations are marked incomplete. Its surviving account matches the memory that returned to you. The torn sheet hidden with the manuscript fits the ragged edge in the notepad and carries the original note; the graphite on the remaining page recovered the impressions it left. You wrote the instructions during the previous attempt. The papers do not reveal your name or what brought you to North Station. They establish only that every other linked witness has been marked CONSISTENT and you are the last one who still remembers another version.',
          recordValue:
            'Near the end is an unsigned form for Room Seven. Six evaluations are marked incomplete. Its surviving account matches the memory that returned to the subject. The torn sheet hidden with the manuscript fits the ragged edge in the notepad and carries the original note; the graphite on the remaining page recovered the impressions it left. The subject wrote the instructions during the previous attempt. The papers do not reveal the subject’s name or what brought the subject to North Station. They establish only that every other linked witness has been marked CONSISTENT and the subject is the last one who still remembers another version.',
          protectedTerms: [
            'Room Seven',
            'the last one who still remembers another version',
          ],
        },
        {
          id: 'national_correction_network',
          value:
            'A final notice sounds: “Automatic correction limit reached. Manual transfer team has arrived.” The handleless door unlocks and slides into the wall. You remain inside the room. Across the corridor stand more identical doors. Beneath a row of government department seals, a status board lists incidents from cities across the country, each divided into NEWS, MEDICAL, JUDICIAL, and ASSOCIATED PERSONS. Most rows are marked CONSISTENT. North Station reads 183/184; the remaining entry is Room Seven. A national map beside the board marks active facilities in every region.\n\nNorth Station is not an isolated cover-up. The government maintains public history by changing records first, then sending everyone who remembers another version into rooms like this one. The manuscript’s final page is blank. At the far end of the corridor, an elevator indicator rises toward this floor. Air from the open door lifts the blank page. The indicator reaches your level. The elevator doors begin to open.',
          recordValue:
            'A final notice sounds: “Automatic correction limit reached. Manual transfer team has arrived.” The handleless door unlocks and slides into the wall. The subject remains inside the room. Across the corridor stand more identical doors. Beneath a row of government department seals, a status board lists incidents from cities across the country, each divided into NEWS, MEDICAL, JUDICIAL, and ASSOCIATED PERSONS. Most rows are marked CONSISTENT. North Station reads 183/184; the remaining entry is Room Seven. A national map beside the board marks active facilities in every region.\n\nNorth Station is not an isolated cover-up. The government maintains public history by changing records first, then sending everyone who remembers another version into rooms like this one. The manuscript’s final page is blank. At the far end of the corridor, an elevator indicator rises toward this floor. Air from the open door lifts the blank page. The indicator reaches the subject’s level. The elevator doors begin to open.',
          protectedTerms: [
            'Manual transfer team has arrived',
            'North Station reads 183/184',
            'government department seals',
            'active facilities in every region',
          ],
        },
      ],
      presentation: 'world_shift',
      completionPolicy: 'must_complete',
    },
  ],
};
