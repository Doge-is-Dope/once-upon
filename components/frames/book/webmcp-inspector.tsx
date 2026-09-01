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
    <details className="webmcp-inspector">
      <summary>
        <span>How AI enters the story</span>
        <small>{statusLabel(status, activeTool)}</small>
      </summary>
      <div className="inspector-body">
        <p className="inspector-intro">
          Core manuscript tools define the stable surface. Story objects can
          become new verbs, then disappear after use.
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
    </details>
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
    <section className="tool-group" aria-label={`${label} WebMCP tools`}>
      <h2>{label}</h2>
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
  if (activeTool) return 'Tool running';
  if (status === 'connected') return 'Tools registered';
  if (status === 'connecting') return 'Registering tools…';
  return 'Tools unavailable';
}
