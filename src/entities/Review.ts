import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    OneToOne,
    JoinColumn,
    Check,
} from "typeorm";
import { ReviewRequest } from "./ReviewRequest.js";

// The OneToOne + JoinColumn on requestId already emits a unique constraint,
// so declaring @Unique here as well would create a duplicate index.
/** The submitted answer to a ReviewRequest. */
@Entity("reviews")
@Check("ck_reviews_score_range", `"performance_score" BETWEEN 1 AND 5`)
export class Review {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    @Column({ type: "uuid" })
    requestId!: string;

    @OneToOne(() => ReviewRequest, (request) => request.review, { onDelete: "CASCADE" })
    @JoinColumn({ name: "request_id" })
    request!: ReviewRequest;

    /** "Deserves a raise or not". */
    @Column({ type: "boolean" })
    recommendsRaise!: boolean;

    @Column({ type: "smallint", nullable: true })
    performanceScore!: number | null;

    @Column({ type: "text", nullable: true })
    comments!: string | null;

    @CreateDateColumn({ type: "timestamptz" })
    submittedAt!: Date;
}
