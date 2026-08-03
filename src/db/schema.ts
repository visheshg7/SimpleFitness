import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: text("display_name"),
  heightCm: numeric("height_cm", { precision: 6, scale: 2, mode: "number" }),
  preferredUnit: text("preferred_unit").$type<"kg" | "lb">().notNull().default("kg"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    defaultUnit: text("default_unit").$type<"kg" | "lb">().notNull().default("kg"),
    primaryMuscle: text("primary_muscle").notNull(),
    secondaryMuscles: text("secondary_muscles").array().notNull().default([]),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("exercises_name_unique").on(table.name)],
);

export const workoutTemplates = pgTable(
  "workout_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("workout_templates_position_unique").on(table.position)],
);

export const templateExercises = pgTable(
  "template_exercises",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id").notNull().references(() => workoutTemplates.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id, { onDelete: "restrict" }),
    orderIndex: integer("order_index").notNull(),
    targetSets: integer("target_sets"),
    targetReps: integer("target_reps"),
  },
  (table) => [
    uniqueIndex("template_exercises_order_unique").on(table.templateId, table.orderIndex),
    uniqueIndex("template_exercises_exercise_unique").on(table.templateId, table.exerciseId),
    index("template_exercises_template_idx").on(table.templateId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sessionDate: date("session_date").notNull(),
    templateId: uuid("template_id").references(() => workoutTemplates.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sessions_owner_date_unique").on(table.ownerId, table.sessionDate),
    index("sessions_owner_completed_idx").on(table.ownerId, table.completedAt),
  ],
);

export const setLogs = pgTable(
  "set_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id, { onDelete: "restrict" }),
    setNumber: integer("set_number").notNull(),
    weightKg: numeric("weight_kg", { precision: 8, scale: 2, mode: "number" }),
    reps: integer("reps"),
    completed: boolean("completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("set_logs_session_exercise_number_unique").on(table.sessionId, table.exerciseId, table.setNumber),
    index("set_logs_exercise_idx").on(table.exerciseId),
  ],
);

export const mealLogs = pgTable(
  "meal_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eatenAt: timestamp("eaten_at", { withTimezone: true }).notNull().defaultNow(),
    rawInput: text("raw_input").notNull(),
    parsedItems: jsonb("parsed_items").$type<Array<{ name: string; quantity?: string; calories?: number; protein?: number; carbs?: number; fat?: number }>>().notNull().default([]),
    calories: numeric("calories", { precision: 8, scale: 1, mode: "number" }),
    protein: numeric("protein", { precision: 8, scale: 1, mode: "number" }),
    carbs: numeric("carbs", { precision: 8, scale: 1, mode: "number" }),
    fat: numeric("fat", { precision: 8, scale: 1, mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("meal_logs_owner_eaten_idx").on(table.ownerId, table.eatenAt)],
);

export const bodyMetrics = pgTable(
  "body_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    metricDate: date("metric_date").notNull(),
    weightKg: numeric("weight_kg", { precision: 8, scale: 2, mode: "number" }).notNull(),
    heightCm: numeric("height_cm", { precision: 6, scale: 2, mode: "number" }),
    bodyFatPercent: numeric("body_fat_percent", { precision: 5, scale: 2, mode: "number" }),
    bmi: numeric("bmi", { precision: 5, scale: 2, mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("body_metrics_owner_date_unique").on(table.ownerId, table.metricDate), index("body_metrics_owner_date_idx").on(table.ownerId, table.metricDate)],
);

export type User = typeof users.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type WorkoutTemplate = typeof workoutTemplates.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;
export type MealLog = typeof mealLogs.$inferSelect;
export type BodyMetric = typeof bodyMetrics.$inferSelect;
