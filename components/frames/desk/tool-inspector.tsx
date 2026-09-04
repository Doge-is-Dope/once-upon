'use client';

import {
  deriveInteractionSurface,
  deriveToolSurface,
} from '@/lib/runtime/engine';
import type {
  ExperienceDefinition,
  ExperienceSession,
  StoryInteractionDefinition,
} from '@/lib/runtime/types';
import type { WebMCPStatus } from '@/lib/webmcp/tools';

export function WebMCPInspector({
  experience,
  session,
  status,
  activeTool,
}: {
  experience: ExperienceDefinition;
  session: ExperienceSession;
  status: WebMCPStatus;
  activeTool: string | null;
}) {
  const active = deriveToolSurface(experience, session);
  const surface = deriveInteractionSurface(experience, session);
  const pending = surface
    .filter(({ useStatus }) => useStatus === 'pending')
    .map(({ interaction }) => interaction.toolName);
  const retired = surface
    .filter(({ useStatus }) => useStatus === 'retired')
    .map(({ interaction }) => interaction.toolName);

  return (
    <div className="webmcp-inspector">
      <div className="inspector-status">
        <h2>Page tools</h2>
        <small>{statusLabel(status, activeTool)}</small>
      </div>
      <div className="inspector-body">
        <p className="inspector-intro">
          Three core tools are always available. Each discovery unlocks a
          single-use tool.
        </p>
        <ToolGroup label="Active" tools={active} activeTool={activeTool} />
        <ToolGroup label="Pending chapter" tools={pending} />
        <ToolGroup label="Retired" tools={retired} />

        <ol className="interaction-timeline">
          {surface.map((state) => (
            <InteractionTimeline
              interaction={state.interaction}
              key={state.interaction.id}
              prerequisitesMet={state.prerequisitesMet}
              registered={state.registered}
              useStatus={state.useStatus}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}

function ToolGroup({
  label,
  tools,
  activeTool,
}: {
  label: string;
  tools: string[];
  activeTool?: string | null;
}) {
  return (
    <section className="tool-group" aria-label={`${label} page tools`}>
      <h3>{label}</h3>
      {tools.length ? (
        <ul>
          {tools.map((name) => (
            <li className={name === activeTool ? 'is-running' : ''} key={name}>
              <code>{name}</code>
              {name === activeTool ? <span>running</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-tools">None</p>
      )}
    </section>
  );
}

function InteractionTimeline({
  interaction,
  prerequisitesMet,
  registered,
  useStatus,
}: {
  interaction: StoryInteractionDefinition;
  prerequisitesMet: boolean;
  registered: boolean;
  useStatus: 'unused' | 'pending' | 'retired';
}) {
  if (!prerequisitesMet && useStatus === 'unused') return null;
  const steps = [
    { label: 'prerequisites', complete: prerequisitesMet },
    { label: 'registered', complete: registered || useStatus !== 'unused' },
    { label: 'invoked', complete: useStatus !== 'unused' },
    { label: 'retired', complete: useStatus === 'retired' },
  ];
  return (
    <li>
      <strong>{interaction.title}</strong>
      <span className="timeline-steps">
        {steps.map((step) => (
          <span className={step.complete ? 'is-complete' : ''} key={step.label}>
            {step.label}
          </span>
        ))}
      </span>
    </li>
  );
}

function statusLabel(status: WebMCPStatus, activeTool: string | null): string {
  if (activeTool) return `Agent calling ${activeTool}`;
  if (status === 'connected') return 'Ready';
  if (status === 'connecting') return 'Preparing…';
  return 'No agent connection';
}
