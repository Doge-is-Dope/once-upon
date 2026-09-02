'use client';

import type { ExperienceDefinition } from '@/lib/runtime/types';
import type { WebMCPStatus } from '@/lib/webmcp/tools';
import { CopyButton } from './copy-button';
import { useDismissiblePanel } from './use-dismissible-panel';

const PRESENCE_PANEL_ID = 'agent-presence-panel';
const PRESENCE_TITLE_ID = 'agent-presence-title';

export type AgentPresenceState =
  | 'unavailable'
  | 'waiting'
  | 'reading'
  | 'writing'
  | 'using'
  | 'attached';

// A small in-world indicator of the agent beside the page: absent, waiting
// for its first word, reading the record, writing into it, or attached and
// idle. It is the only always-visible trace of what the agent is doing.
export function AgentPresence({
  activeTool,
  agentActive,
  experience,
  onAnnounce,
  status,
}: {
  activeTool: string | null;
  agentActive: boolean;
  experience: ExperienceDefinition;
  onAnnounce: (message: string) => void;
  status: WebMCPStatus;
}) {
  const { open, rootRef, triggerRef, toggle } = useDismissiblePanel();
  const presence = resolveAgentPresence(status, agentActive, activeTool);
  const label = presenceLabel(presence, activeTool, experience);
  const explainable = presence === 'waiting';
  const panelOpen = open && explainable;
  // Without a connection the availability slip already says so.
  if (presence === 'unavailable') return null;

  return (
    <div
      className="agent-presence"
      data-presence={presence}
      data-running={
        presence === 'reading' || presence === 'writing' || presence === 'using'
          ? 'true'
          : undefined
      }
      ref={rootRef}
    >
      <button
        aria-controls={explainable ? PRESENCE_PANEL_ID : undefined}
        aria-expanded={explainable ? panelOpen : undefined}
        aria-label={`Agent status: ${label}`}
        className="agent-presence-trigger"
        disabled={!explainable}
        onClick={toggle}
        ref={triggerRef}
        title={label}
        type="button"
      >
        <span aria-hidden="true" className="agent-presence-lamp" />
        <span className="agent-presence-label">{label}</span>
      </button>
      {explainable ? (
        <div
          aria-hidden={!panelOpen}
          aria-labelledby={PRESENCE_TITLE_ID}
          className="agent-presence-panel"
          data-open={panelOpen || undefined}
          id={PRESENCE_PANEL_ID}
          inert={!panelOpen}
        >
          <p className="agent-presence-kicker" id={PRESENCE_TITLE_ID}>
            No agent has spoken yet
          </p>
          <p>
            Your agent can read and write this page. Send it this message to
            begin, changing the last sentence to your own move:
          </p>
          <div className="agent-handoff-example">
            <p>{experience.startMessage}</p>
            <CopyButton
              className="inline-copy-action handoff-copy-button"
              iconOnly
              idleLabel="Copy example message"
              onCopied={() =>
                onAnnounce(
                  'Starter copied. Change the last sentence to your own move before sending.',
                )
              }
              onCopyFailed={() =>
                onAnnounce(
                  'Copy failed. The message is selected for manual copying.',
                )
              }
              text={experience.startMessage}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function resolveAgentPresence(
  status: WebMCPStatus,
  agentActive: boolean,
  activeTool: string | null,
): AgentPresenceState {
  if (status !== 'connected') return 'unavailable';
  if (activeTool === 'get_story_state') return 'reading';
  if (
    activeTool === 'begin_story_turn' ||
    activeTool === 'commit_story_chapter'
  )
    return 'writing';
  if (activeTool) return 'using';
  return agentActive ? 'attached' : 'waiting';
}

export function presenceLabel(
  presence: AgentPresenceState,
  activeTool: string | null,
  experience: ExperienceDefinition,
): string {
  switch (presence) {
    case 'unavailable':
      return '';
    case 'waiting':
      return 'No agent yet';
    case 'reading':
      return 'Agent reading…';
    case 'writing':
      return 'Agent writing…';
    case 'using': {
      const interaction = experience.story.interactions.find(
        ({ toolName }) => toolName === activeTool,
      );
      return interaction
        ? `Agent using ${interaction.title.replace(/^The /, 'the ')}…`
        : 'Agent acting…';
    }
    case 'attached':
      return 'Agent attached';
  }
}
