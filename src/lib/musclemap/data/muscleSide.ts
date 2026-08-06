/**
 * Side/gender enums.
 *
 * Direct port of `MuscleSide.swift`.
 */

/** Which side of the body a muscle belongs to. */
export type MuscleSide = 'left' | 'right' | 'both';

/** Which face of the body to display. */
export type BodySide = 'front' | 'back';

/** The body gender model. */
export type BodyGender = 'male' | 'female';

export const MUSCLE_SIDES: readonly MuscleSide[] = ['left', 'right', 'both'];
export const BODY_SIDES: readonly BodySide[] = ['front', 'back'];
export const BODY_GENDERS: readonly BodyGender[] = ['male', 'female'];
