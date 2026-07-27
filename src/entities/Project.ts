import {
    Entity,
    PrimaryColumn,
    Generated,
    Column,
    CreateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
    Unique,
    Check,
} from "typeorm";
import { bigintTransformer } from "./transformers.js";
import { ENUM_COLUMN_LENGTH, type ProjectStatus } from "../types/enums.js";
import { Company } from "./Company.js";
import { User } from "./User.js";
import { Allocation } from "./Allocation.js";

// There is no "teams" layer: a project's workforce is derived from allocations.
@Entity("projects")
@Unique("uq_projects_company_name", ["companyId", "name"])
@Check(
    "ck_projects_dates_valid",
    `"end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date"`,
)
export class Project {
    @PrimaryColumn({ type: "bigint", transformer: bigintTransformer })
    @Generated("increment")
    id!: number;

    @Column({ type: "bigint", transformer: bigintTransformer })
    companyId!: number;

    @ManyToOne(() => Company, (company) => company.projects, { onDelete: "CASCADE" })
    @JoinColumn({ name: "company_id" })
    company!: Company;

    /** Project manager / lead. Nulled rather than cascading if the user is removed. */
    @Column({ type: "bigint", transformer: bigintTransformer, nullable: true })
    managerId!: number | null;

    @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
    @JoinColumn({ name: "manager_id" })
    manager!: User | null;

    @Column({ type: "varchar", length: 150 })
    name!: string;

    @Column({ type: "varchar", length: 150, nullable: true })
    clientName!: string | null;

    /** Validated in code via isProjectStatus. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH, default: "planned" })
    status!: ProjectStatus;

    @Column({ type: "date", nullable: true })
    startDate!: string | null;

    @Column({ type: "date", nullable: true })
    endDate!: string | null;

    @Column({ type: "numeric", precision: 14, scale: 2, nullable: true })
    budget!: string | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @OneToMany(() => Allocation, (allocation) => allocation.project)
    allocations!: Allocation[];
}
