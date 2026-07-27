import { Company } from "./Company.js";
import { User } from "./User.js";
import { EmployeeProfile } from "./EmployeeProfile.js";
import { Invitation } from "./Invitation.js";
import { Salary } from "./Salary.js";
import { Project } from "./Project.js";
import { Allocation } from "./Allocation.js";
import { Skill } from "./Skill.js";
import { EmployeeSkill } from "./EmployeeSkill.js";
import { ReviewCycle } from "./ReviewCycle.js";
import { ReviewRequest } from "./ReviewRequest.js";
import { Review } from "./Review.js";

export {
    Company,
    User,
    EmployeeProfile,
    Invitation,
    Salary,
    Project,
    Allocation,
    Skill,
    EmployeeSkill,
    ReviewCycle,
    ReviewRequest,
    Review,
};

/** Feeds DataSource.entities - keep every new entity registered here. */
export const entities = [
    Company,
    User,
    EmployeeProfile,
    Invitation,
    Salary,
    Project,
    Allocation,
    Skill,
    EmployeeSkill,
    ReviewCycle,
    ReviewRequest,
    Review,
];
