import {
    Entity,
    PrimaryColumn,
    Generated,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
    Check,
} from "typeorm";
import { bigintTransformer } from "./transformers.js";
import { User } from "./User.js";
import { Project } from "./Project.js";

/** Who works on what, at what percentage. Coworkers are derived from these. */
@Entity("allocations")
@Check("ck_allocations_percent_range", `"allocation_percent" BETWEEN 1 AND 100`)
@Check("ck_allocations_dates_valid", `"end_date" IS NULL OR "end_date" >= "start_date"`)
@Index("idx_allocations_user", ["userId"])
@Index("idx_allocations_project", ["projectId"])
// A user can only have one open allocation per project. Closed allocations
// (end_date set) may repeat, so re-joining a project later still works.
@Index("uq_allocation_open_per_project", ["userId", "projectId"], {
    unique: true,
    where: `"end_date" IS NULL`,
})
export class Allocation {
    @PrimaryColumn({ type: "bigint", transformer: bigintTransformer })
    @Generated("increment")
    id!: number;

    @Column({ type: "bigint", transformer: bigintTransformer })
    userId!: number;

    @ManyToOne(() => User, (user) => user.allocations, { onDelete: "CASCADE" })
    @JoinColumn({ name: "user_id" })
    user!: User;

    @Column({ type: "bigint", transformer: bigintTransformer })
    projectId!: number;

    @ManyToOne(() => Project, (project) => project.allocations, { onDelete: "CASCADE" })
    @JoinColumn({ name: "project_id" })
    project!: Project;

    @Column({ type: "smallint" })
    allocationPercent!: number;

    @Column({ type: "varchar", length: 100, nullable: true })
    roleOnProject!: string | null;

    @Column({ type: "date", default: () => "CURRENT_DATE" })
    startDate!: string;

    @Column({ type: "date", nullable: true })
    endDate!: string | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;
}
