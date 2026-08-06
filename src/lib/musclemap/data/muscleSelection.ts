/**
 * A convenience wrapper around `Set<Muscle>` for multi-selection.
 *
 * Direct port of `MuscleSelection.swift`.
 */

import type { Muscle } from './muscle';

export class MuscleSelection {
  private readonly set: Set<Muscle>;

  constructor(muscles: Set<Muscle> | Muscle[] = []) {
    this.set = new Set(muscles);
  }

  /** Toggles the presence of a muscle in the selection. */
  toggle(muscle: Muscle): void {
    if (this.set.has(muscle)) {
      this.set.delete(muscle);
    } else {
      this.set.add(muscle);
    }
  }

  /** Adds a muscle to the selection. */
  add(muscle: Muscle): void {
    this.set.add(muscle);
  }

  /** Removes a muscle from the selection. */
  remove(muscle: Muscle): void {
    this.set.delete(muscle);
  }

  /** Whether the selection is empty. */
  get isEmpty(): boolean {
    return this.set.size === 0;
  }

  /** The number of selected muscles. */
  get count(): number {
    return this.set.size;
  }

  /** Whether the selection contains the given muscle. */
  contains(muscle: Muscle): boolean {
    return this.set.has(muscle);
  }

  /** The underlying set of muscles. */
  get muscles(): Set<Muscle> {
    return this.set;
  }

  /** A shallow copy of the underlying set. */
  toSet(): Set<Muscle> {
    return new Set(this.set);
  }

  equals(other: MuscleSelection | Set<Muscle>): boolean {
    const otherSet = other instanceof MuscleSelection ? other.set : other;
    if (otherSet.size !== this.set.size) return false;
    for (const m of this.set) {
      if (!otherSet.has(m)) return false;
    }
    return true;
  }
}
