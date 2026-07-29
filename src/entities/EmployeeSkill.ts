import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, Check } from "typeorm";
import { bigintTransformer } from "./transformers.js";
import { User } from "./User.js";
import { Skill } from "./Skill.js";

/** Join table with payload, so it is a first-class entity rather than a ManyToMany. */
@Entity("employee_skills")
@Check("ck_employee_skills_proficiency_range", `"proficiency" BETWEEN 1 AND 5`)
@Check("ck_employee_skills_years_non_negative", `"years_experience" >= 0`)
export class EmployeeSkill {
    @PrimaryColumn({ type: "bigint", transformer: bigintTransformer })
    userId!: number;

    @ManyToOne(() => User, (user) => user.skills, { onDelete: "CASCADE" })
    @JoinColumn({ name: "user_id" })
    user!: User;

    @PrimaryColumn({ type: "bigint", transformer: bigintTransformer })
    skillId!: number;

    @ManyToOne(() => Skill, (skill) => skill.employeeSkills, { onDelete: "CASCADE" })
    @JoinColumn({ name: "skill_id" })
    skill!: Skill;

    @Column({ type: "smallint", nullable: true })
    proficiency!: number | null;

    @Column({ type: "numeric", precision: 4, scale: 1, nullable: true })
    yearsExperience!: string | null;
}
