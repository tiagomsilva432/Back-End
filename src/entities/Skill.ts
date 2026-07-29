import {
    Entity,
    PrimaryColumn,
    Generated,
    Column,
    OneToMany,
    Unique,
} from "typeorm";
import { bigintTransformer } from "./transformers.js";
import { ENUM_COLUMN_LENGTH, type SkillCategory } from "../types/enums.js";
import { EmployeeSkill } from "./EmployeeSkill.js";

@Entity("skills")
@Unique("uq_skills_name", ["name"])
export class Skill {
    @PrimaryColumn({ type: "bigint", transformer: bigintTransformer })
    @Generated("increment")
    id!: number;

    @Column({ type: "varchar", length: 100 })
    name!: string;

    /** Validated in code via isSkillCategory. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH, default: "other" })
    category!: SkillCategory;

    @OneToMany(() => EmployeeSkill, (employeeSkill) => employeeSkill.skill)
    employeeSkills!: EmployeeSkill[];
}
