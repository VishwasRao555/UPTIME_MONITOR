'use strict';

const { evaluate } = require('../../src/services/stateMachine.service');

const THRESHOLD = 3;
const up = { isUp: true };
const down = { isUp: false };

describe('stateMachine.evaluate', () => {
  test('PENDING + success → UP, no transition', () => {
    const r = evaluate({ currentStatus: 'PENDING', consecutiveFailures: 0 }, up, THRESHOLD);
    expect(r).toEqual({ nextStatus: 'UP', nextConsecutiveFailures: 0, transition: null });
  });

  test('UP + success stays UP, streak stays 0', () => {
    const r = evaluate({ currentStatus: 'UP', consecutiveFailures: 0 }, up, THRESHOLD);
    expect(r).toEqual({ nextStatus: 'UP', nextConsecutiveFailures: 0, transition: null });
  });

  test('UP + failures below threshold stays UP but counts', () => {
    const r1 = evaluate({ currentStatus: 'UP', consecutiveFailures: 0 }, down, THRESHOLD);
    expect(r1).toEqual({ nextStatus: 'UP', nextConsecutiveFailures: 1, transition: null });

    const r2 = evaluate({ currentStatus: 'UP', consecutiveFailures: 1 }, down, THRESHOLD);
    expect(r2).toEqual({ nextStatus: 'UP', nextConsecutiveFailures: 2, transition: null });
  });

  test('reaching the threshold trips DOWN exactly once', () => {
    const r = evaluate({ currentStatus: 'UP', consecutiveFailures: 2 }, down, THRESHOLD);
    expect(r).toEqual({ nextStatus: 'DOWN', nextConsecutiveFailures: 3, transition: 'DOWN' });
  });

  test('already DOWN + more failures does not re-fire the alert', () => {
    const r = evaluate({ currentStatus: 'DOWN', consecutiveFailures: 5 }, down, THRESHOLD);
    expect(r).toEqual({ nextStatus: 'DOWN', nextConsecutiveFailures: 6, transition: null });
  });

  test('DOWN + success fires RECOVERY and clears the streak', () => {
    const r = evaluate({ currentStatus: 'DOWN', consecutiveFailures: 6 }, up, THRESHOLD);
    expect(r).toEqual({ nextStatus: 'UP', nextConsecutiveFailures: 0, transition: 'RECOVERY' });
  });

  test('a single failure never trips DOWN when threshold is 1... ', () => {
    const r = evaluate({ currentStatus: 'UP', consecutiveFailures: 0 }, down, 1);
    expect(r).toEqual({ nextStatus: 'DOWN', nextConsecutiveFailures: 1, transition: 'DOWN' });
  });
});
