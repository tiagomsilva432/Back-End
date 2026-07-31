/**
 * The SQL schema's ENUM types, moved to the code side.
 *
 * These are plain VARCHAR columns in the database: adding a member here needs no
 * migration, but it also means the database will NOT reject an invalid value.
 * The string values below are the exact bytes stored in those columns - renaming
 * a member is free, changing its value is a data migration.
 */

/**
 * Builds a runtime type predicate for a string enum. `Object.values` is exact
 * here because string enums (unlike numeric ones) get no reverse mapping.
 */
function guard<T extends Record<string, string>>(enumObject: T) {
    const values = new Set<string>(Object.values(enumObject));
    return (v: unknown): v is T[keyof T] => typeof v === "string" && values.has(v);
}

export enum UserRole {
    Admin = "admin",
    Employee = "employee",
}
export const isUserRole = guard(UserRole);

export enum UserStatus {
    Invited = "invited",
    Active = "active",
    Suspended = "suspended",
    Terminated = "terminated",
}
export const isUserStatus = guard(UserStatus);

export enum ProjectStatus {
    Planned = "planned",
    Active = "active",
    OnHold = "on_hold",
    Completed = "completed",
    Cancelled = "cancelled",
}
export const isProjectStatus = guard(ProjectStatus);

export enum SkillCategory {
    Language = "language",
    Framework = "framework",
    Role = "role",
    Tool = "tool",
    SoftSkill = "soft_skill",
    Other = "other",
}
export const isSkillCategory = guard(SkillCategory);

export enum ReviewRequestStatus {
    Pending = "pending",
    Submitted = "submitted",
    Declined = "declined",
    Expired = "expired",
}
export const isReviewRequestStatus = guard(ReviewRequestStatus);

/** Shared column definition so every enum-backed column is declared identically. */
export const ENUM_COLUMN_LENGTH = 20;
