function guard<T extends Record<string, string>>(enumObject: T) {
    const values = new Set<string>(Object.values(enumObject));
    return (v: unknown): v is T[keyof T] => typeof v === "string" && values.has(v);
}

export enum UserRole {
    SystemAdmin = "system_admin",
    CompanyAdmin = "company_admin",
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

/** Quem vê um aviso: toda a gente, uma empresa, ou quem está num projeto. */
export enum AnnouncementScope {
    System = "system",
    Company = "company",
    Project = "project",
}
export const isAnnouncementScope = guard(AnnouncementScope);

export enum AnnouncementSeverity {
    Info = "info",
    Warning = "warning",
    Critical = "critical",
}
export const isAnnouncementSeverity = guard(AnnouncementSeverity);

export const ENUM_COLUMN_LENGTH = 20;
