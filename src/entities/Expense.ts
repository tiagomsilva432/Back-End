import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
    Check,
} from "typeorm";
import { ENUM_COLUMN_LENGTH, type ExpenseCategory } from "../types/enums.js";
import { Company } from "./Company.js";
import { Project } from "./Project.js";
import { User } from "./User.js";

/**
 * Money spent: on a project, or by the company itself (rent, licences) when
 * projectId is null. Salaries are not expenses: they stay in `salaries`, and
 * the finance service adds them up on its own (see services/finance.ts).
 */
@Entity("expenses")
@Check("ck_expenses_amount_positive", `"amount" > 0`)
@Index("idx_expenses_company", ["companyId", "incurredOn"])
@Index("idx_expenses_project", ["projectId", "incurredOn"])
export class Expense {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    /** Copied from the project when there is one, so the dashboard never needs a join to filter. */
    @Column({ type: "uuid" })
    companyId!: string;

    @ManyToOne(() => Company, { onDelete: "CASCADE" })
    @JoinColumn({ name: "company_id" })
    company!: Company;

    /** Null means a company expense, outside any project. */
    @Column({ type: "uuid", nullable: true })
    projectId!: string | null;

    @ManyToOne(() => Project, { onDelete: "CASCADE", nullable: true })
    @JoinColumn({ name: "project_id" })
    project!: Project | null;

    @Column({ type: "varchar", length: 150 })
    title!: string;

    @Column({ type: "text", nullable: true })
    description!: string | null;

    // Kept as a string: NUMERIC through a JS number would round cents away.
    @Column({ type: "numeric", precision: 12, scale: 2 })
    amount!: string;

    /** Not constrained by the database; guard with isExpenseCategory before writing. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH })
    category!: ExpenseCategory;

    /** The day the money was spent, which is what the charts plot. Never in the future. */
    @Column({ type: "date" })
    incurredOn!: string;

    /** Who logged it. Audit trail, so no inverse relation. */
    @Column({ type: "uuid" })
    createdBy!: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "created_by" })
    createdByUser!: User;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}
