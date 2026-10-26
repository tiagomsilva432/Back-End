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
import { AbsenceStatus, type AbsenceType, ENUM_COLUMN_LENGTH } from "../types/enums.js";
import { Company } from "./Company.js";
import { User } from "./User.js";

/**
 * One person away for a run of whole days: vacation, a sick day or other leave.
 * The dates are inclusive. It only shows on everyone's calendar once a
 * company_admin approves it.
 */
@Entity("absence_requests")
@Check("ck_absence_requests_dates_valid", `"end_date" >= "start_date"`)
@Index("idx_absence_requests_user", ["userId", "startDate"])
@Index("idx_absence_requests_company", ["companyId", "status"])
export class AbsenceRequest {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    /** The person's company, copied so the calendar never needs a join to filter. */
    @Column({ type: "uuid" })
    companyId!: string;

    @ManyToOne(() => Company, { onDelete: "CASCADE" })
    @JoinColumn({ name: "company_id" })
    company!: Company;

    @Column({ type: "uuid" })
    userId!: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "user_id" })
    user!: User;

    /** Not constrained by the database; guard with isAbsenceType before writing. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH })
    type!: AbsenceType;

    /** Not constrained by the database; guard with isAbsenceStatus before writing. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH, default: AbsenceStatus.Pending })
    status!: AbsenceStatus;

    @Column({ type: "date" })
    startDate!: string;

    /** Inclusive: a single day has startDate = endDate. */
    @Column({ type: "date" })
    endDate!: string;

    /** The requester's reason. Only the person and the admins ever see it. */
    @Column({ type: "text", nullable: true })
    note!: string | null;

    /** Who approved, rejected or cancelled it. Audit trail, so no inverse relation. */
    @Column({ type: "uuid", nullable: true })
    decidedBy!: string | null;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "decided_by" })
    decidedByUser!: User | null;

    @Column({ type: "timestamptz", nullable: true })
    decidedAt!: Date | null;

    /** Why it was rejected or cancelled, when the admin says. */
    @Column({ type: "text", nullable: true })
    decisionNote!: string | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}
