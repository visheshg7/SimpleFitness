/**
 * Tracks selection state changes, enabling undo/redo for muscle selections.
 *
 * Direct port of `SelectionHistory.swift`.
 */

import type { Muscle } from '../data/muscle';

function setsEqual(a: ReadonlySet<Muscle>, b: ReadonlySet<Muscle>): boolean {
  if (a.size !== b.size) return false;
  for (const m of a) {
    if (!b.has(m)) return false;
  }
  return true;
}

export class SelectionHistory {
  /** Maximum number of entries kept in the undo stack. */
  readonly maxEntries: number;

  private undoStack: Set<Muscle>[] = [];
  private redoStack: Set<Muscle>[] = [];
  private current: Set<Muscle> = new Set();

  /** Creates a new selection history (default max undo steps: 50). */
  constructor(maxEntries = 50) {
    this.maxEntries = maxEntries;
  }

  /** Pushes a new selection state. Clears the redo stack. */
  push(selection: Set<Muscle>): void {
    if (setsEqual(selection, this.current)) return;
    this.undoStack.push(new Set(this.current));
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.shift();
    }
    this.current = new Set(selection);
    this.redoStack = [];
  }

  /** Reverts to the previous selection state, or `null` if nothing to undo. */
  undo(): Set<Muscle> | null {
    const previous = this.undoStack.pop();
    if (previous === undefined) return null;
    this.redoStack.push(this.current);
    this.current = previous;
    return new Set(previous);
  }

  /** Re-applies a previously undone selection, or `null` if nothing to redo. */
  redo(): Set<Muscle> | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(this.current);
    this.current = next;
    return new Set(next);
  }

  /** Whether there are entries to undo. */
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether there are entries to redo. */
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** The current selection state. */
  get selection(): Set<Muscle> {
    return new Set(this.current);
  }
}
