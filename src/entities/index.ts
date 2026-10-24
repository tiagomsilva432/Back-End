import { Company } from "./Company.js";
import { User } from "./User.js";
import { EmployeeProfile } from "./EmployeeProfile.js";
import { Salary } from "./Salary.js";
import { Project } from "./Project.js";
import { Allocation } from "./Allocation.js";
import { Skill } from "./Skill.js";
import { EmployeeSkill } from "./EmployeeSkill.js";
import { ReviewCycle } from "./ReviewCycle.js";
import { ReviewRequest } from "./ReviewRequest.js";
import { Review } from "./Review.js";
import { Announcement } from "./Announcement.js";
import { AnnouncementRead } from "./AnnouncementRead.js";
import { Notification } from "./Notification.js";

export {
    Company,
    User,
    EmployeeProfile,
    Salary,
    Project,
    Allocation,
    Skill,
    EmployeeSkill,
    ReviewCycle,
    ReviewRequest,
    Review,
    Announcement,
    AnnouncementRead,
    Notification,
};

/** Feeds DataSource.entities - keep every new entity registered here. */
export const entities = [
    Company,
    User,
    EmployeeProfile,
    Salary,
    Project,
    Allocation,
    Skill,
    EmployeeSkill,
    ReviewCycle,
    ReviewRequest,
    Review,
    Announcement,
    AnnouncementRead,
    Notification,
];
