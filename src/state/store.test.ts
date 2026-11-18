import { describe, expect, it } from 'vitest';
import { createStore } from './store';

describe('createStore', () => {
  it('tells every listener about a change even when one throws, then reports that error once', () => {
    const reported: unknown[] = [];
    const store = createStore(0, (error) => reported.push(error));
    const heard: number[] = [];
    store.subscribe(() => {
      throw new Error('a listener that breaks');
    });
    store.subscribe((value) => heard.push(value));
    store.subscribe(() => {
      throw new Error('another one');
    });
    store.dispatch(() => 1);
    expect(store.get()).toBe(1);
    expect(heard).toEqual([1]);
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).message).toBe('a listener that breaks');
  });
});
