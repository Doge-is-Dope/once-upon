'use client';

import { BookOpenTextIcon } from '@phosphor-icons/react/dist/ssr/BookOpenText';
import { WrenchIcon } from '@phosphor-icons/react/dist/ssr/Wrench';
import { XIcon } from '@phosphor-icons/react/dist/ssr/X';
import { useEffect, useRef, useState } from 'react';
import type { PlayerClueEntry } from '@/lib/manuscript/clue-journal';
import type {
  BookFrameCopy,
  ExperienceDefinition,
  ExperienceSession,
} from '@/lib/runtime/types';
import type { WebMCPStatus } from '@/lib/webmcp/tools';
import { DESK_RAIL_ID, StoryClues } from './story-clues';
import { WebMCPInspector } from './tool-inspector';

type RailTab = 'notes' | 'tools';

const TAB_IDS: Record<RailTab, { tab: string; panel: string }> = {
  notes: { tab: 'desk-rail-tab-notes', panel: 'desk-rail-panel-notes' },
  tools: { tab: 'desk-rail-tab-tools', panel: 'desk-rail-panel-tools' },
};

// The notepad beside the record. Docked on wide desks, where it is always
// open; on narrower ones it floats over the felt and the header key toggles
// it. Either way the page underneath keeps reading and turning normally.
export function DeskRail({
  acknowledgedClueIds,
  activeTool,
  clues,
  copy,
  debugMode,
  docked,
  experience,
  hasNewClues,
  notesAvailable,
  onAcknowledge,
  onOpenChange,
  open,
  session,
  webMCPStatus,
}: {
  acknowledgedClueIds: ReadonlySet<string>;
  activeTool: string | null;
  clues: PlayerClueEntry[];
  copy: BookFrameCopy;
  debugMode: boolean;
  docked: boolean;
  experience: ExperienceDefinition;
  hasNewClues: boolean;
  notesAvailable: boolean;
  onAcknowledge: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  session: ExperienceSession;
  webMCPStatus: WebMCPStatus;
}) {
  const [selectedTab, setSelectedTab] = useState<RailTab>('notes');
  const tab: RailTab = debugMode && selectedTab === 'tools' ? 'tools' : 'notes';
  const closeRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Record<RailTab, HTMLButtonElement | null>>({
    notes: null,
    tools: null,
  });

  // Switching the inspector on in Settings brings its tab forward once.
  const previousDebugMode = useRef(debugMode);
  useEffect(() => {
    if (debugMode && !previousDebugMode.current) setSelectedTab('tools');
    previousDebugMode.current = debugMode;
  }, [debugMode]);

  const floatingOpen = !docked && open;
  useEffect(() => {
    if (!floatingOpen) return;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onOpenChange(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [floatingOpen, onOpenChange]);

  // Looking at the notebook is what marks a note as seen: the pointer
  // resting on it or focus landing inside it.
  const notesPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = notesPanelRef.current;
    if (!panel || !hasNewClues) return;
    panel.addEventListener('pointerenter', onAcknowledge);
    panel.addEventListener('focusin', onAcknowledge);
    return () => {
      panel.removeEventListener('pointerenter', onAcknowledge);
      panel.removeEventListener('focusin', onAcknowledge);
    };
  }, [hasNewClues, onAcknowledge]);

  const hidden = !docked && !open;
  const tabs: RailTab[] = ['notes', 'tools'];
  const moveTab = (from: RailTab, step: 1 | -1) => {
    const index = tabs.indexOf(from);
    const next = tabs[(index + step + tabs.length) % tabs.length]!;
    setSelectedTab(next);
    tabRefs.current[next]?.focus();
  };
  return (
    <aside
      aria-label="Notebook"
      className="desk-rail"
      data-open={open || undefined}
      data-tabbed={debugMode || undefined}
      id={DESK_RAIL_ID}
      inert={hidden}
    >
      <div aria-hidden="true" className="story-clues-binding" />
      {!docked ? (
        <button
          aria-label="Close notes"
          className="desk-rail-close"
          onClick={() => onOpenChange(false)}
          ref={closeRef}
          type="button"
        >
          <XIcon aria-hidden="true" size={18} />
        </button>
      ) : null}
      {/* The section tabs only exist once the inspector has a page of its
          own; in ordinary play the notebook is the single page. */}
      {debugMode ? (
        <div
          aria-label="Notebook sections"
          className="desk-rail-tabs"
          role="tablist"
        >
          {tabs.map((name) => (
            <button
              aria-controls={TAB_IDS[name].panel}
              aria-selected={tab === name}
              className="desk-rail-tab"
              id={TAB_IDS[name].tab}
              key={name}
              onClick={() => setSelectedTab(name)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') moveTab(name, 1);
                if (event.key === 'ArrowLeft') moveTab(name, -1);
              }}
              ref={(element) => {
                tabRefs.current[name] = element;
              }}
              role="tab"
              tabIndex={tab === name ? 0 : -1}
              type="button"
            >
              {name === 'notes' ? (
                <>
                  <BookOpenTextIcon aria-hidden="true" size={16} />
                  <span>Notes</span>
                  {notesAvailable ? (
                    <span className="desk-rail-tab-count">{clues.length}</span>
                  ) : null}
                  {hasNewClues ? (
                    <>
                      <span aria-hidden="true" className="desk-rail-tab-dot" />
                      <span className="sr-only">, new note available</span>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <WrenchIcon aria-hidden="true" size={16} />
                  <span>Tools</span>
                </>
              )}
            </button>
          ))}
        </div>
      ) : null}
      <div
        aria-labelledby={debugMode ? TAB_IDS.notes.tab : undefined}
        className="desk-rail-panel"
        hidden={tab !== 'notes'}
        id={TAB_IDS.notes.panel}
        ref={notesPanelRef}
        role={debugMode ? 'tabpanel' : undefined}
        tabIndex={0}
      >
        <StoryClues
          acknowledgedClueIds={acknowledgedClueIds}
          available={notesAvailable}
          clues={clues}
          copy={copy}
        />
      </div>
      {debugMode ? (
        <div
          aria-labelledby={TAB_IDS.tools.tab}
          className="desk-rail-panel"
          hidden={tab !== 'tools'}
          id={TAB_IDS.tools.panel}
          role="tabpanel"
          tabIndex={0}
        >
          <WebMCPInspector
            activeTool={activeTool}
            experience={experience}
            session={session}
            status={webMCPStatus}
          />
        </div>
      ) : null}
    </aside>
  );
}
