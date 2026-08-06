/**
 * Muscle definitions, hierarchy and helpers.
 *
 * Direct port of `Muscle.swift` (the `Muscle` enum, its computed properties and
 * the internal `BodySlug`).
 */

/** All 36 muscle groups (22 base + 14 sub-groups). */
export const MUSCLE = {
  // Base muscles
  abs: 'abs',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  deltoids: 'deltoids',
  feet: 'feet',
  forearm: 'forearm',
  gluteal: 'gluteal',
  hamstring: 'hamstring',
  hands: 'hands',
  head: 'head',
  knees: 'knees',
  lowerBack: 'lower-back',
  obliques: 'obliques',
  quadriceps: 'quadriceps',
  tibialis: 'tibialis',
  trapezius: 'trapezius',
  triceps: 'triceps',
  upperBack: 'upper-back',
  rotatorCuff: 'rotator-cuff',
  serratus: 'serratus',
  rhomboids: 'rhomboids',
  // Sub-groups
  ankles: 'ankles',
  adductors: 'adductors',
  neck: 'neck',
  hipFlexors: 'hip-flexors',
  upperChest: 'upper-chest',
  lowerChest: 'lower-chest',
  innerQuad: 'inner-quad',
  outerQuad: 'outer-quad',
  upperAbs: 'upper-abs',
  lowerAbs: 'lower-abs',
  frontDeltoid: 'front-deltoid',
  rearDeltoid: 'rear-deltoid',
  upperTrapezius: 'upper-trapezius',
  lowerTrapezius: 'lower-trapezius',
} as const;

export type Muscle = (typeof MUSCLE)[keyof typeof MUSCLE];

/** Every muscle value, in declaration order. */
export const ALL_MUSCLES: Muscle[] = Object.values(MUSCLE);

const MUSCLE_SET: ReadonlySet<string> = new Set(ALL_MUSCLES);

export function isMuscle(value: string): value is Muscle {
  return MUSCLE_SET.has(value);
}

/**
 * Internal-only slug that additionally includes `hair` for rendering purposes.
 * Mirrors `BodySlug`.
 */
export type BodySlug = Muscle | 'hair';

export const HAIR_SLUG: BodySlug = 'hair';

/** Maps a body slug to a muscle, or `undefined` for cosmetic parts (hair). */
export function bodySlugMuscle(slug: BodySlug): Muscle | undefined {
  return slug === HAIR_SLUG ? undefined : (isMuscle(slug) ? slug : undefined);
}

/** Whether this is a cosmetic part (head) rather than a muscle. */
export function isCosmeticPart(muscle: Muscle): boolean {
  return muscle === MUSCLE.head;
}

/** Sub-groups belonging to a muscle group. Empty if it has no sub-groups. */
export function muscleSubGroups(muscle: Muscle): Muscle[] {
  switch (muscle) {
    case MUSCLE.chest:
      return [MUSCLE.upperChest, MUSCLE.lowerChest];
    case MUSCLE.quadriceps:
      return [MUSCLE.innerQuad, MUSCLE.outerQuad, MUSCLE.hipFlexors];
    case MUSCLE.abs:
      return [MUSCLE.upperAbs, MUSCLE.lowerAbs];
    case MUSCLE.deltoids:
      return [MUSCLE.frontDeltoid, MUSCLE.rearDeltoid];
    case MUSCLE.trapezius:
      return [MUSCLE.upperTrapezius, MUSCLE.lowerTrapezius];
    case MUSCLE.obliques:
      return [MUSCLE.serratus];
    case MUSCLE.feet:
      return [MUSCLE.ankles];
    case MUSCLE.hamstring:
      return [MUSCLE.adductors];
    case MUSCLE.head:
      return [MUSCLE.neck];
    default:
      return [];
  }
}

/** The parent muscle group, if this muscle is a sub-group. */
export function muscleParentGroup(muscle: Muscle): Muscle | undefined {
  switch (muscle) {
    case MUSCLE.upperChest:
    case MUSCLE.lowerChest:
      return MUSCLE.chest;
    case MUSCLE.innerQuad:
    case MUSCLE.outerQuad:
    case MUSCLE.hipFlexors:
      return MUSCLE.quadriceps;
    case MUSCLE.upperAbs:
    case MUSCLE.lowerAbs:
      return MUSCLE.abs;
    case MUSCLE.frontDeltoid:
    case MUSCLE.rearDeltoid:
      return MUSCLE.deltoids;
    case MUSCLE.upperTrapezius:
    case MUSCLE.lowerTrapezius:
      return MUSCLE.trapezius;
    case MUSCLE.serratus:
      return MUSCLE.obliques;
    case MUSCLE.ankles:
      return MUSCLE.feet;
    case MUSCLE.adductors:
      return MUSCLE.hamstring;
    case MUSCLE.neck:
      return MUSCLE.head;
    default:
      return undefined;
  }
}

/** Whether this muscle is a sub-group of another muscle. */
export function isSubGroup(muscle: Muscle): boolean {
  return muscleParentGroup(muscle) !== undefined;
}

/**
 * Whether this sub-group is always rendered even when sub-groups are hidden.
 * When tapped in default mode, the parent muscle is returned instead.
 */
export function isAlwaysVisibleSubGroup(muscle: Muscle): boolean {
  switch (muscle) {
    case MUSCLE.ankles:
    case MUSCLE.adductors:
    case MUSCLE.neck:
      return true;
    default:
      return false;
  }
}

/** Key used for localization lookup (matches the Swift `localizationKey`). */
export function muscleLocalizationKey(muscle: Muscle): string {
  return muscle;
}

/** Whether a slug is rendered as a muscle region in the body map. */
export function isVisibleSlug(slug: BodySlug): boolean {
  return bodySlugMuscle(slug) !== undefined;
}
