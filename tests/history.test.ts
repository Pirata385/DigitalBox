import { describe, expect, it } from 'vitest';
import { commitHistory, createHistory, redoHistory, undoHistory } from '../src/model/history';

describe('history', () => {
  it('commit pushes the previous present, and undo and redo move through it', () => {
    let h = createHistory('a');
    h = commitHistory(h, 'b');
    h = commitHistory(h, 'c');
    expect(h).toEqual({ past: ['a', 'b'], present: 'c', future: [] });

    h = undoHistory(h);
    expect(h.present).toBe('b');
    expect(h.future).toEqual(['c']);

    h = redoHistory(h);
    expect(h).toEqual({ past: ['a', 'b'], present: 'c', future: [] });
  });

  it('a new commit after an undo clears the future', () => {
    let h = commitHistory(createHistory(1), 2);
    h = undoHistory(h);
    h = commitHistory(h, 3);
    expect(h.future).toEqual([]);
    expect(h.present).toBe(3);
  });

  it('committing the same object returns the same history', () => {
    const h = createHistory(1);
    expect(commitHistory(h, h.present)).toBe(h);
  });

  it('drops the oldest past entries beyond the limit', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 5; i++) h = commitHistory(h, i, 3);
    expect(h.past).toEqual([2, 3, 4]);
    expect(h.present).toBe(5);
  });

  it('undo with nothing to undo, and redo with nothing to redo, change nothing', () => {
    const h = createHistory('only');
    expect(undoHistory(h)).toBe(h);
    expect(redoHistory(h)).toBe(h);
  });
});
