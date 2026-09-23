import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    OneToOne,
    JoinColumn,
    Index,
    Check,
} from "typeorm";
import { ENUM_COLUMN_LENGTH, ReviewRequestStatus } from "../types/enums.js";
import { Company } from "./Company.js";
import { User } from "./User.js";
import { ReviewCycle } from "./ReviewCycle.js";
import { Review } from "./Review.js";

/**
 * One request for one reviewer to review one reviewee.
 * Ad-hoc requests have a null cycleId; cycle requests are generated in bulk
 * from the project_coworkers view. Company metrics aggregate over cycles only.
 */
@Entity("review_requests")
@Check("ck_review_requests_distinct_parties", `"reviewer_id" <> "reviewee_id"`)
// One review per pair per cycle. Ad-hoc duplicates stay allowed over time.
@Index("uq_request_pair_per_cycle", ["cycleId", "reviewerId", "revieweeId"], {
    unique: true,
    where: `"cycle_id" IS NOT NULL`,
})
@Index("idx_review_requests_reviewer", ["reviewerId", "status"])
@Index("idx_review_requests_reviewee", ["revieweeId"])
export class ReviewRequest {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    @Column({ type: "uuid" })
    companyId!: string;

    @ManyToOne(() => Company, { onDelete: "CASCADE" })
    @JoinColumn({ name: "company_id" })
    company!: Company;

    /** Null means an ad-hoc request rather than part of a cycle. */
    @Column({ type: "uuid", nullable: true })
    cycleId!: string | null;

    @ManyToOne(() => ReviewCycle, (cycle) => cycle.requests, {
        onDelete: "CASCADE",
        nullable: true,
    })
    @JoinColumn({ name: "cycle_id" })
    cycle!: ReviewCycle | null;

    /** The admin who launched it. Audit trail, so no inverse relation. */
    @Column({ type: "uuid" })
    requestedBy!: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "requested_by" })
    requestedByUser!: User;

    @Column({ type: "uuid" })
    reviewerId!: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "reviewer_id" })
    reviewer!: User;

    @Column({ type: "uuid" })
    revieweeId!: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "reviewee_id" })
    reviewee!: User;

    /** Not constrained by the database; guard with isReviewRequestStatus before writing. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH, default: ReviewRequestStatus.Pending })
    status!: ReviewRequestStatus;

    @Column({ type: "date", nullable: true })
    dueDate!: string | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @OneToOne(() => Review, (review) => review.request)
    review!: Review | null;
}
