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

/** Full salary history. The current salary is the row where effectiveTo is null. */
@Entity("salaries")
@Check("ck_salaries_amount_non_negative", `"amount" >= 0`)
@Check(
    "ck_salaries_period_valid",
    `"effective_to" IS NULL OR "effective_to" > "effective_from"`,
)
// Partial unique index: at most one open salary row per user.
@Index("uq_salary_current", ["userId"], { unique: true, where: `"effective_to" IS NULL` })
export class Salary {
    @PrimaryColumn({ type: "bigint", transformer: bigintTransformer })
    @Generated("increment")
    id!: number;

    @Column({ type: "bigint", transformer: bigintTransformer })
    userId!: number;

    @ManyToOne(() => User, (user) => user.salaries, { onDelete: "CASCADE" })
    @JoinColumn({ name: "user_id" })
    user!: User;

    // Kept as a string: NUMERIC through a JS number would round cents away.
    @Column({ type: "numeric", precision: 12, scale: 2 })
    amount!: string;

    @Column({ type: "varchar", length: 3, default: "EUR" })
    currency!: string;

    @Column({ type: "date" })
    effectiveFrom!: string;

    /** Null means this is the current salary. */
    @Column({ type: "date", nullable: true })
    effectiveTo!: string | null;

    @Column({ type: "varchar", length: 255, nullable: true })
    reason!: string | null;

    /** The admin who set this salary. Audit trail, so no inverse relation. */
    @Column({ type: "bigint", transformer: bigintTransformer })
    createdBy!: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: "created_by" })
    createdByUser!: User;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;
}
