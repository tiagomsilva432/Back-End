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
} from "typeorm";
import { bigintTransformer } from "./transformers.js";
import { Company } from "./Company.js";
import { User } from "./User.js";
import { ReviewRequest } from "./ReviewRequest.js";

/** A company-wide review round, e.g. "Q3 2026 Performance Review". */
@Entity("review_cycles")
@Unique("uq_review_cycles_company_name", ["companyId", "name"])
export class ReviewCycle {
    @PrimaryColumn({ type: "bigint", transformer: bigintTransformer })
    @Generated("increment")
    id!: number;

    @Column({ type: "bigint", transformer: bigintTransformer })
    companyId!: number;

    @ManyToOne(() => Company, { onDelete: "CASCADE" })
    @JoinColumn({ name: "company_id" })
    company!: Company;

    @Column({ type: "varchar", length: 100 })
    name!: string;

    /** Audit trail, so no inverse relation. */
    @Column({ type: "bigint", transformer: bigintTransformer })
    openedBy!: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: "opened_by" })
    openedByUser!: User;

    @Column({ type: "date", nullable: true })
    deadline!: string | null;

    /** Null means the cycle is still running. */
    @Column({ type: "timestamptz", nullable: true })
    closedAt!: Date | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @OneToMany(() => ReviewRequest, (request) => request.cycle)
    requests!: ReviewRequest[];
}
