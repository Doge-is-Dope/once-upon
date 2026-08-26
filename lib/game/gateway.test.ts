import { describe, expect, it, vi } from 'vitest';
import { GameGateway } from './gateway';
import type { PublicEvent } from './contracts';

const nextEvent: PublicEvent = {
  id: 9,
  sequence: 9,
  type: 'answers_revealed',
  actor: 'server',
  summary: 'Answers revealed',
  payload: {},
  createdAt: '2026-08-26T00:00:00Z',
};

describe('GameGateway.waitForPublicEvent', () => {
  it('returns a durable event without subscribing', async () => {
    const gateway = new GameGateway();
    vi.spyOn(gateway, 'getEventsAfter').mockResolvedValue([nextEvent]);
    const subscribe = vi.spyOn(gateway, 'subscribe');

    await expect(gateway.waitForPublicEvent('game', 8, 20_000)).resolves.toEqual(nextEvent);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('subscribes, re-reads, and cleans up after an event', async () => {
    const gateway = new GameGateway();
    vi.spyOn(gateway, 'getEventsAfter')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([nextEvent]);
    const unsubscribe = vi.fn();
    vi.spyOn(gateway, 'subscribe').mockResolvedValue(unsubscribe);

    await expect(gateway.waitForPublicEvent('game', 8, 20_000)).resolves.toEqual(nextEvent);
    expect(gateway.getEventsAfter).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('honors cancellation even while subscription setup is pending', async () => {
    const gateway = new GameGateway();
    vi.spyOn(gateway, 'getEventsAfter').mockResolvedValue([]);
    let finishSubscription!: (cleanup: () => void) => void;
    vi.spyOn(gateway, 'subscribe').mockReturnValue(new Promise((resolve) => { finishSubscription = resolve; }));
    const unsubscribe = vi.fn();
    const controller = new AbortController();

    const waiting = gateway.waitForPublicEvent('game', 8, 20_000, controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    finishSubscription(unsubscribe);
    await Promise.resolve();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('caps the wait at twenty seconds and cleans up', async () => {
    vi.useFakeTimers();
    const gateway = new GameGateway();
    vi.spyOn(gateway, 'getEventsAfter').mockResolvedValue([]);
    const unsubscribe = vi.fn();
    vi.spyOn(gateway, 'subscribe').mockResolvedValue(unsubscribe);

    const waiting = gateway.waitForPublicEvent('game', 8, 99_000);
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(waiting).resolves.toBeNull();
    expect(unsubscribe).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
