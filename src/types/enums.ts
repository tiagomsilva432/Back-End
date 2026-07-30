/**
 * The SQL schema's ENUM types, moved to the code side.
 *
 * These are plain VARCHAR columns in the database: adding a value here needs no
 * migration, but it also means the database will NOT reject an invalid value.
 * Everything writing to these columns must go through the guards below.
 */

function guard<const T extends readonly string[]>(values: T) {
    return (v: unknown): v is T[number] =>
        typeof v === "string" && (values as readonly string[]).includes(v);
}

export const USER_ROLES = ["admin", "employee"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const isUserRole = guard(USER_ROLES);

export const USER_STATUSES = ["invited", "active", "suspended", "terminated"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const isUserStatus = guard(USER_STATUSES);

export const PROJECT_STATUSES = [
    "planned",
    "active",
    "on_hold",
    "completed",
    "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const isProjectStatus = guard(PROJECT_STATUSES);

export const SKILL_CATEGORIES = [
    "language",
    "framework",
    "role",
    "tool",
    "soft_skill",
    "other",
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];
export const isSkillCategory = guard(SKILL_CATEGORIES);

export const REVIEW_REQUEST_STATUSES = [
    "pending",
    "submitted",
    "declined",
    "expired",
] as const;
export type ReviewRequestStatus = (typeof REVIEW_REQUEST_STATUSES)[number];
export const isReviewRequestStatus = guard(REVIEW_REQUEST_STATUSES);

/** Shared column definition so every enum-backed column is declared identically. */
export const ENUM_COLUMN_LENGTH = 20;