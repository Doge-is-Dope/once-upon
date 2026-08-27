import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from './tooltip';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Tooltip', () => {
  it('keeps instances independent and preserves existing descriptions and click handlers', () => {
    const onClick = vi.fn();
    render(<>
      <p id="existing-help">Existing help.</p>
      <Tooltip content="First hint."><button id="existing-button" aria-describedby="existing-help" onClick={onClick}>First</button></Tooltip>
      <Tooltip content="Second hint."><button>Second</button></Tooltip>
    </>);
    const hints = screen.getAllByRole('tooltip', { hidden: true });
    expect(hints[0].id).not.toBe(hints[1].id);
    const first = screen.getByRole('button', { name: 'First' });
    expect(first).toHaveAttribute('id', 'existing-button');
    expect(first).toHaveAccessibleDescription('Existing help. First hint.');
    expect(screen.getByRole('button', { name: 'Second' })).toHaveAccessibleDescription('Second hint.');
    fireEvent.click(first);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('leaves the normal trigger as the only focus stop and shows on keyboard focus', () => {
    render(<Tooltip content="More information."><a href="#details">Details</a></Tooltip>);
    const link = screen.getByRole('link', { name: 'Details' });
    expect(link.parentElement).not.toHaveAttribute('tabindex');
    const hint = screen.getByRole('tooltip', { hidden: true });
    act(() => link.focus());
    expect(hint).toHaveAttribute('data-open', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(hint).toHaveAttribute('data-open', 'false');
    expect(link).toHaveFocus();
  });

  it('makes a disabled trigger description keyboard-accessible without enabling its action', () => {
    const onClick = vi.fn();
    render(<Tooltip content="Unavailable."><button disabled onClick={onClick}>Start</button></Tooltip>);
    const wrapper = screen.getByRole('group', { name: 'Start' });
    const button = screen.getByRole('button', { name: 'Start' });
    expect(wrapper).toHaveAttribute('tabindex', '0');
    expect(wrapper).toHaveAccessibleDescription('Unavailable.');
    act(() => wrapper.focus());
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveAttribute('data-open', 'true');
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps the tooltip hoverable across the small gap and closes after leaving', () => {
    vi.useFakeTimers();
    render(<Tooltip content="Hover help."><button>Details</button></Tooltip>);
    const trigger = screen.getByRole('button', { name: 'Details' }).parentElement!;
    const hint = screen.getByRole('tooltip', { hidden: true });
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerLeave(trigger);
    fireEvent.pointerEnter(hint);
    act(() => vi.advanceTimersByTime(200));
    expect(hint).toHaveAttribute('data-open', 'true');
    fireEvent.pointerLeave(hint);
    act(() => vi.advanceTimersByTime(200));
    expect(hint).toHaveAttribute('data-open', 'false');
  });

  it('supports links in a non-modal help popover and returns focus on Escape', () => {
    const follow = vi.fn();
    render(<Tooltip interactiveLabel="Browser support" content={<>Read <a href="#docs" onClick={(event) => { event.preventDefault(); follow(); }}>the docs</a></>}><button disabled>Start</button></Tooltip>);
    const trigger = screen.getByRole('group', { name: 'Start' });
    const help = screen.getByRole('dialog', { hidden: true });
    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
    expect(trigger).toHaveAccessibleDescription('Read the docs');
    act(() => trigger.focus());
    const docs = screen.getByRole('link', { name: 'the docs', hidden: true });
    act(() => docs.focus());
    expect(docs).toHaveFocus();
    expect(help).toHaveAttribute('data-open', 'true');
    fireEvent.pointerDown(docs);
    fireEvent.click(docs);
    expect(follow).toHaveBeenCalledOnce();
    expect(help).toHaveAttribute('data-open', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(help).toHaveAttribute('data-open', 'false');
    expect(trigger).toHaveFocus();
  });

  it('opens for touch and dismisses on an outside interaction', () => {
    render(<Tooltip content="Touch help."><button disabled>Start</button></Tooltip>);
    const wrapper = screen.getByRole('group', { name: 'Start' });
    const touch = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    fireEvent(wrapper, touch);
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveAttribute('data-open', 'true');
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveAttribute('data-open', 'false');
  });

  it.each([
    [200, 100, '152px', '40px'],
    [10, 0, '58px', '16px'],
  ])('positions above the trigger, or below when near the top edge (%s, %s)', (top, left, expectedTop, expectedLeft) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'tooltip'
        ? { width: 200, height: 40 } as DOMRect
        : { top, left, bottom: top + 40, width: 80, height: 40 } as DOMRect;
    });
    render(<Tooltip content="Positioned help."><button>Details</button></Tooltip>);
    act(() => screen.getByRole('button', { name: 'Details' }).focus());
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveStyle({ top: expectedTop, left: expectedLeft });
  });

  it('does not add a tooltip or a focus stop when there is no content', () => {
    render(<Tooltip content={null}><button disabled>Start</button></Tooltip>);
    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).not.toHaveAttribute('aria-describedby');
  });
});
