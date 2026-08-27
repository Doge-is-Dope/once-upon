import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameGateway } from '@/lib/game/gateway';
import * as webMcp from '@/lib/webmcp/registry';
import * as supabase from '@/lib/supabase/client';
import { GameApp } from './game-app';

describe('GameApp landing', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    vi.spyOn(webMcp, 'getWebMcpCapability').mockReturnValue({ supported: true });
    vi.spyOn(webMcp, 'bindGameLauncher').mockResolvedValue(() => {});
    vi.spyOn(supabase, 'hasSupabaseConfig').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps the server-rendered start disabled without claiming the browser is unsupported', () => {
    const markup = document.createElement('div');
    markup.innerHTML = renderToString(<GameApp />);
    expect(markup.querySelector('.hero-actions button')).toBeDisabled();
    expect(markup.querySelector('.tooltip-content')).toBeNull();
    expect(webMcp.getWebMcpCapability).not.toHaveBeenCalled();
  });

  it('enables start after a supported browser check without a compatibility hint', () => {
    render(<GameApp />);
    const start = screen.getByRole('button', { name: 'Start a game' });
    expect(start).toBeEnabled();
    expect(start).not.toHaveAttribute('aria-describedby');
    expect(document.querySelector('.tooltip-content')).toBeNull();
    expect(screen.getByText('“Let’s play.”')).toBeVisible();
    expect(webMcp.bindGameLauncher).not.toHaveBeenCalled();
  });

  it('makes the AI entry available without creating a room on page load', () => {
    vi.mocked(supabase.hasSupabaseConfig).mockReturnValue(true);
    const create = vi.spyOn(gameGateway, 'createRoom');
    render(<GameApp />);
    expect(webMcp.bindGameLauncher).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });

  it('disables unsupported browsers with one short accessible hint and never creates a room', () => {
    vi.mocked(webMcp.getWebMcpCapability).mockReturnValue({ supported: false, issue: 'api_unavailable', reason: 'WebMCP is unavailable in this browser.' });
    vi.mocked(supabase.hasSupabaseConfig).mockReturnValue(true);
    const create = vi.spyOn(gameGateway, 'createRoom');
    render(<GameApp />);
    const start = screen.getByRole('button', { name: 'Start a game' });
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription('This browser doesn’t support WebMCP');
    const hint = screen.getByRole('dialog', { hidden: true });
    expect(hint).toHaveTextContent(/^This browser doesn’t support WebMCP$/);
    expect(hint).toHaveAttribute('data-open', 'false');
    const docs = within(hint).getByRole('link', { hidden: true });
    expect(docs).toHaveTextContent('WebMCP');
    expect(docs).toHaveAttribute('href', 'https://developer.chrome.com/docs/ai/webmcp');
    expect(docs).toHaveAttribute('target', '_blank');
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(start);
    expect(create).not.toHaveBeenCalled();
    expect(webMcp.bindGameLauncher).not.toHaveBeenCalled();
    expect(screen.queryByText('“Let’s play.”')).not.toBeInTheDocument();
  });

  it('guides desktop Chrome 149+ users to enable WebMCP without linking to a chrome URL', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    vi.mocked(webMcp.getWebMcpCapability).mockReturnValue({
      supported: false,
      issue: 'api_unavailable',
      reason: 'WebMCP is unavailable in this browser.',
      canEnableWithChromeFlag: true,
    });
    render(<GameApp />);

    const start = screen.getByRole('button', { name: 'Start a game' });
    const trigger = screen.getByRole('group', { name: 'Start a game' });
    const hint = screen.getByRole('dialog', { hidden: true });
    expect(hint).toHaveAttribute('aria-label', 'WebMCP setup');
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription(/WebMCP isn’t enabled/);
    expect(hint).toHaveTextContent('Paste this into Chrome’s address bar, then set WebMCP Testing to Enabled.');
    expect(hint).not.toHaveTextContent('Enable WebMCP Testing, then relaunch Chrome.');
    expect(hint).not.toHaveTextContent('Learn more');
    expect(hint).toHaveTextContent('chrome://flags/#enable-webmcp-testing');
    expect(within(hint).queryByRole('link', { name: /chrome:\/\/flags/i, hidden: true })).not.toBeInTheDocument();
    const docs = within(hint).getByRole('link', { name: 'WebMCP', hidden: true });
    expect(docs).toHaveAttribute('href', 'https://developer.chrome.com/docs/ai/webmcp');

    fireEvent.pointerEnter(trigger);
    const copy = within(hint).getByRole('button', { name: 'Copy Chrome setting', hidden: true });
    expect(copy.parentElement).toHaveClass('webmcp-setup-address');
    expect(copy.querySelectorAll('.webmcp-copy-icon')).toHaveLength(2);
    await act(async () => { fireEvent.click(copy); });
    expect(writeText).toHaveBeenCalledExactlyOnceWith('chrome://flags/#enable-webmcp-testing');
    expect(copy).toHaveAttribute('data-copied', 'true');
    expect(copy).toHaveAttribute('data-celebrating', 'true');
    expect(copy).toBeDisabled();
    expect(copy).toHaveAccessibleName('Chrome setting copied');
    expect(within(copy).queryByText('Copied')).not.toBeInTheDocument();
    expect(copy.querySelector('.webmcp-copy-status')).toHaveTextContent('Chrome setting copied.');
    const firstBurst = copy.querySelector('.webmcp-copy-confetti');
    expect(firstBurst?.children).toHaveLength(8);

    await act(async () => { fireEvent.click(copy); });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(copy.querySelector('.webmcp-copy-confetti')).toBe(firstBurst);
    act(() => vi.advanceTimersByTime(600));
    expect(copy).toHaveAttribute('data-copied', 'true');
    expect(copy).toHaveAttribute('data-celebrating', 'false');
    expect(copy.querySelector('.webmcp-copy-confetti')).not.toBeInTheDocument();
    fireEvent.pointerLeave(trigger);
    fireEvent.pointerEnter(trigger);
    expect(copy).toHaveAttribute('data-celebrating', 'false');
    expect(copy.querySelector('.webmcp-copy-confetti')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_399));
    expect(copy).toBeDisabled();
    act(() => vi.advanceTimersByTime(1));
    expect(copy).toHaveAccessibleName('Copy Chrome setting');
    expect(copy).toBeEnabled();
    expect(copy).toHaveAttribute('data-copied', 'false');
    expect(copy.querySelector('.webmcp-copy-confetti')).not.toBeInTheDocument();
    expect(copy.querySelector('.webmcp-copy-status')).toBeEmptyDOMElement();
    vi.useRealTimers();
  });

  it.each([
    ['https_required', 'Open this game over HTTPS.'],
    ['origin_isolation_required', 'This host is missing origin isolation.'],
  ] as const)('preserves the actual setup problem: %s', (issue, reason) => {
    vi.mocked(webMcp.getWebMcpCapability).mockReturnValue({ supported: false, issue, reason });
    render(<GameApp />);
    expect(screen.getByRole('button', { name: 'Start a game' })).toBeDisabled();
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(reason);
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument();
  });

  it('rechecks support on window focus and cleans up when the landing unmounts', () => {
    vi.mocked(webMcp.getWebMcpCapability).mockReturnValue({ supported: false, issue: 'api_unavailable', reason: 'WebMCP is unavailable in this browser.' });
    const { unmount } = render(<GameApp />);
    const start = screen.getByRole('button', { name: 'Start a game' });
    expect(start).toBeDisabled();
    vi.mocked(webMcp.getWebMcpCapability).mockReturnValue({ supported: true });
    fireEvent.focus(window);
    expect(start).toBeEnabled();
    expect(document.querySelector('.tooltip-content')).toBeNull();
    vi.mocked(webMcp.getWebMcpCapability).mockReturnValue({ supported: false, issue: 'api_unavailable', reason: 'WebMCP is unavailable in this browser.' });
    fireEvent.focus(window);
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription('This browser doesn’t support WebMCP');
    unmount();
    vi.mocked(webMcp.getWebMcpCapability).mockClear();
    fireEvent.focus(window);
    expect(webMcp.getWebMcpCapability).not.toHaveBeenCalled();
  });

  it('keeps start disabled during creation and retains existing failure handling', async () => {
    vi.mocked(supabase.hasSupabaseConfig).mockReturnValue(true);
    let fail!: (error: Error) => void;
    const create = vi.spyOn(gameGateway, 'createRoom').mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
    render(<GameApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));
    const pending = screen.getByRole('button', { name: 'Creating room…' });
    expect(pending).toBeDisabled();
    fireEvent.focus(window);
    fireEvent.click(pending);
    expect(create).toHaveBeenCalledExactlyOnceWith('standard', 8);
    expect(document.querySelector('.tooltip-content')).toBeNull();
    await act(async () => fail(new Error('Unable to create room.')));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to create room.');
    expect(screen.getByRole('button', { name: 'Start a game' })).toBeEnabled();
  });

  it('still checks support again at creation time', () => {
    vi.mocked(supabase.hasSupabaseConfig).mockReturnValue(true);
    const create = vi.spyOn(gameGateway, 'createRoom');
    render(<GameApp />);
    vi.mocked(webMcp.getWebMcpCapability).mockReturnValue({ supported: false, issue: 'api_unavailable', reason: 'WebMCP is unavailable in this browser.' });
    fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('WebMCP is unavailable in this browser.');
  });

  it('reveals the disabled-start explanation on hover or focus and dismisses it with Escape', () => {
    vi.mocked(webMcp.getWebMcpCapability).mockReturnValue({ supported: false, issue: 'api_unavailable', reason: 'WebMCP is unavailable in this browser.' });
    render(<GameApp />);
    const trigger = screen.getByRole('group', { name: 'Start a game' });
    const hint = screen.getByRole('dialog', { hidden: true });
    expect(trigger).toHaveAccessibleDescription('This browser doesn’t support WebMCP');
    expect(hint).toHaveAttribute('data-open', 'false');
    fireEvent.pointerEnter(trigger);
    expect(hint).toHaveAttribute('data-open', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(hint).toHaveAttribute('data-open', 'false');
    act(() => trigger.focus());
    expect(hint).toHaveAttribute('data-open', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(hint).toHaveAttribute('data-open', 'false');
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Start a game' })).toBeDisabled();
  });

  it('explains the complete game rules and exposes one clear start', () => {
    render(<GameApp />);
    expect(screen.getByRole('heading', { name: /can you fool the ai detective/i })).toBeInTheDocument();
    expect(screen.getByText(/two friends team up/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Start with honest answers' })).toBeInTheDocument();
    expect(screen.getByText(/both of you answer five questions honestly/i)).toBeInTheDocument();
    expect(screen.getByText('What would you order?')).toBeInTheDocument();
    expect(document.querySelector('.tutorial-round-badge')?.textContent).toBe('Learn');
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
    expect(screen.getByText('Pizza')).toBeInTheDocument();
    expect(screen.getByText('Sushi')).toBeInTheDocument();
    expect(screen.queryByText('My honest answer')).not.toBeInTheDocument();
    expect(screen.queryByText('Both answer as themselves')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start a game' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quick demo' })).not.toBeInTheDocument();
    expect(screen.getByText('Built for the WebMCP Challenge')).toBeInTheDocument();
    expect(screen.queryByText(/Private answers stay private until reveal/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show step 2: Get secret roles/i }));
    expect(document.querySelector('.tutorial-round-badge')).toHaveTextContent('Secret roles');
    expect(screen.queryByText('Same team · Secret roles')).not.toBeInTheDocument();
    expect(screen.getByText(/same team.*roles stay hidden/i)).toBeInTheDocument();
    expect(screen.getByText('Answer like the Original')).toBeInTheDocument();
    expect(screen.queryByText('Predict the Original')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show step 3: Answer for your role/i }));
    expect(document.querySelector('.tutorial-round-badge')?.textContent).toBe('Challenge');
    expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();
    expect(screen.getByText(/Original answers as themselves.*Mirror predicts the Original/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show step 4: Object once/i }));
    expect(screen.queryByText('Suspicion hidden')).not.toBeInTheDocument();
    expect(document.querySelector('.tutorial-scene-header')).not.toBeInTheDocument();
    expect(screen.getByText(/3 seconds to blindly use one shared Objection.*First tap spends it/i)).toBeInTheDocument();
    expect(screen.getByText('Objection!', { exact: true })).toBeInTheDocument();
    expect(document.querySelector('.objection-token .tutorial-corner-emoji')).toHaveTextContent('✋');
    expect(document.querySelector('.follow-up-card .tutorial-corner-emoji')).toHaveTextContent('🤖');
    expect(screen.queryByText('One shared token')).not.toBeInTheDocument();
    expect(screen.queryByText('×1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show step 5: Make the AI accuse/i }));
    expect(screen.getByText(/points at the Original, you both win.*catches the Mirror, the AI wins/i)).toBeInTheDocument();
  });

  it('reports missing backend configuration without pretending to create a room', () => {
    render(<GameApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/needs its Supabase public environment values/i);
  });

  it('keeps the selected rule visible until the player chooses another one', () => {
    render(<GameApp />);
    fireEvent.click(screen.getByRole('button', { name: /Show step 4: Object once/i }));
    expect(screen.getByRole('heading', { name: 'Object once, before you know' })).toBeInTheDocument();
  });

  it('switches tutorial content and focus with arrows, including wraparound and Home/End', async () => {
    const user = userEvent.setup();
    render(<GameApp />);
    const steps = within(screen.getByRole('list', { name: 'Game rules' })).getAllByRole('button');
    act(() => steps[0].focus());
    for (const index of [1, 2, 3, 4, 0]) {
      await user.keyboard('{ArrowRight}');
      expect(steps[index]).toHaveFocus();
      expect(steps[index]).toHaveAttribute('aria-current', 'step');
      expect(screen.getByText(`Step ${index + 1} of 5`)).toBeInTheDocument();
      expect(steps.filter((button) => button.tabIndex === 0)).toEqual([steps[index]]);
    }
    await user.keyboard('{ArrowLeft}');
    expect(steps[4]).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Make the AI accuse the wrong player' })).toBeInTheDocument();
    await user.keyboard('{Home}');
    expect(steps[0]).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Start with honest answers' })).toBeInTheDocument();
    await user.keyboard('{End}');
    expect(steps[4]).toHaveFocus();
  });

  it('switches steps immediately from page load without moving focus', async () => {
    const user = userEvent.setup();
    render(<GameApp />);
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('heading', { name: 'Get secret roles' })).toBeInTheDocument();
    expect(document.body).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('heading', { name: 'Make the AI accuse the wrong player' })).toBeInTheDocument();
    expect(document.body).toHaveFocus();
  });

  it('keeps one tutorial Tab stop while page-wide arrows preserve focus outside the steps', async () => {
    const user = userEvent.setup();
    render(<GameApp />);
    const selected = screen.getByRole('button', { name: 'Show step 3: Answer for your role' });
    await user.click(selected);
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Start a game' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    const next = screen.getByRole('button', { name: 'Show step 4: Object once, before you know' });
    expect(next).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: 'Start a game' })).toHaveFocus();
    await user.tab();
    expect(next).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(selected).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Answer for your role' })).toBeInTheDocument();
  });

  it('preserves editing keys, modifier shortcuts and other handled events', () => {
    render(<><GameApp /><input aria-label="Name" /><textarea aria-label="Notes" /><select aria-label="Choice"><option>One</option></select><div contentEditable aria-label="Editor" role="textbox" /></>);
    for (const target of [screen.getByLabelText('Name'), screen.getByLabelText('Notes'), screen.getByLabelText('Choice'), screen.getByLabelText('Editor')]) {
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      fireEvent(target, event);
      expect(event.defaultPrevented).toBe(false);
    }
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'isComposing']) {
      fireEvent.keyDown(window, { key: 'ArrowRight', [modifier]: true });
    }
    const handled = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    handled.preventDefault();
    fireEvent(window, handled);
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
  });

  it('removes the page-wide shortcut when the tutorial unmounts', () => {
    const { unmount } = render(<GameApp />);
    unmount();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(false);
  });
});
