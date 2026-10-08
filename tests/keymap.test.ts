import { describe, expect, it } from 'vitest';
import { commandFor, nudgeFor } from '../src/ui/keymap';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('commandFor', () => {
  it('maps Ctrl+Z to undo and Ctrl+Shift+Z to redo', () => {
    expect(commandFor(key('z', { ctrlKey: true }))).toBe('undo');
    expect(commandFor(key('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
  });

  it('maps Ctrl+Y to redo', () => {
    expect(commandFor(key('y', { ctrlKey: true }))).toBe('redo');
  });

  it('maps Cmd as well as Ctrl', () => {
    expect(commandFor(key('z', { metaKey: true }))).toBe('undo');
  });

  it('maps r to rotate and ? to help', () => {
    expect(commandFor(key('r'))).toBe('rotate');
    expect(commandFor(key('?'))).toBe('help');
  });

  it('maps Ctrl+S to save and Ctrl+O to open', () => {
    expect(commandFor(key('s', { ctrlKey: true }))).toBe('save');
    expect(commandFor(key('o', { ctrlKey: true }))).toBe('open');
  });

  it('maps the editing and view keys', () => {
    expect(commandFor(key('Delete'))).toBe('delete');
    expect(commandFor(key('Backspace'))).toBe('delete');
    expect(commandFor(key('Escape'))).toBe('escape');
    expect(commandFor(key('a', { ctrlKey: true }))).toBe('selectAll');
    expect(commandFor(key('c', { ctrlKey: true }))).toBe('copy');
    expect(commandFor(key('v', { ctrlKey: true }))).toBe('paste');
    expect(commandFor(key('d', { ctrlKey: true }))).toBe('duplicate');
    expect(commandFor(key('+'))).toBe('zoomIn');
    expect(commandFor(key('-'))).toBe('zoomOut');
    expect(commandFor(key('0'))).toBe('zoomReset');
    expect(commandFor(key('f'))).toBe('fit');
    expect(commandFor(key('g'))).toBe('toggleSnap');
    expect(commandFor(key('Tab'))).toBe('cycle');
    expect(commandFor(key('Enter'))).toBe('activate');
  });

  it('leaves Ctrl+R to the browser and returns null for unknown keys', () => {
    expect(commandFor(key('r', { ctrlKey: true }))).toBeNull();
    expect(commandFor(key('q'))).toBeNull();
  });
});

describe('nudgeFor', () => {
  it('moves 1 px for an arrow and 10 px with Shift', () => {
    expect(nudgeFor({ key: 'ArrowLeft', shiftKey: false })).toEqual({ dx: -1, dy: 0 });
    expect(nudgeFor({ key: 'ArrowDown', shiftKey: true })).toEqual({ dx: 0, dy: 10 });
  });

  it('returns null for keys that are not arrows', () => {
    expect(nudgeFor({ key: 'a', shiftKey: false })).toBeNull();
  });
});
