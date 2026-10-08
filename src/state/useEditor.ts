import { useStore } from 'zustand';
import { editor, type EditorState } from './store';

/** Subscribes a React component to a slice of the editor state. */
export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useStore(editor, selector);
}
