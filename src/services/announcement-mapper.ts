import type { AnnouncementFeedItem, AnnouncementResponse } from "../dtos/announcement/announcement-dto.js";
import type { Announcement } from "../entities/Announcement.js";
import { isAnnouncementActive } from "./announcement-policy.js";

export const toAnnouncementResponse = (announcement: Announcement, now: Date = new Date()): AnnouncementResponse => ({
    id: announcement.id,
    scope: announcement.scope,
    companyId: announcement.companyId,
    projectId: announcement.projectId,
    createdBy: announcement.createdBy,
    title: announcement.title,
    body: announcement.body,
    severity: announcement.severity,
    pinned: announcement.pinned,
    startsAt: announcement.startsAt.toISOString(),
    endsAt: announcement.endsAt ? announcement.endsAt.toISOString() : null,
    active: isAnnouncementActive(announcement, now),
    createdAt: announcement.createdAt.toISOString(),
    updatedAt: announcement.updatedAt.toISOString(),
});

export const toAnnouncementFeedItem = (announcement: Announcement, read: boolean, now?: Date): AnnouncementFeedItem => ({
    ...toAnnouncementResponse(announcement, now),
    read,
});
