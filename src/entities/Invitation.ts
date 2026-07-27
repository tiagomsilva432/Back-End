import {
    Entity,
    PrimaryColumn,
    Generated,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
    Unique,
} from "typeorm";
import { bigintTransformer } from "./transformers.js";
import {
    ENUM_COLUMN_LENGTH,
    type InvitationStatus,
    type UserRole,
} from "../types/enums.js";
import { Company } from "./Company.js";
import { User } from "./User.js";

/**
 * Two-step sign-in.
 *  1. An admin creates the invitation with a temporary email + password.
 *  2. The invitee logs in with those via the emailed token link, then sets
 *     their real email and password.
 */
@Entity("invitations")
@Unique("uq_invitations_token", ["token"])
@Index("idx_invitations_status", ["companyId", "status"])
export class Invitation {
    @PrimaryColumn({ type: "bigint", transformer: bigintTransformer })
    @Generated("increment")
    id!: number;

    @Column({ type: "bigint", transformer: bigintTransformer })
    companyId!: number;

    @ManyToOne(() => Company, { onDelete: "CASCADE" })
    @JoinColumn({ name: "company_id" })
    company!: Company;

    @Column({ type: "bigint", transformer: bigintTransformer })
    invitedByUserId!: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: "invited_by_user_id" })
    invitedByUser!: User;

    /** Filled once the user row is created. */
    @Column({ type: "bigint", transformer: bigintTransformer, nullable: true })
    inviteeUserId!: number | null;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "invitee_user_id" })
    inviteeUser!: User | null;

    /** Temporary company email used for the first sign-in. */
    @Column({ type: "varchar", length: 255 })
    tempEmail!: string;

    @Column({ type: "varchar", length: 255 })
    tempPasswordHash!: string;

    /** Sent in the invitation email. Requires PostgreSQL 13+ for gen_random_uuid(). */
    @Column({ type: "uuid", default: () => "gen_random_uuid()" })
    token!: string;

    /** Validated in code via isUserRole. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH, default: "employee" })
    intendedRole!: UserRole;

    /** Validated in code via isInvitationStatus. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH, default: "pending" })
    status!: InvitationStatus;

    @Column({ type: "timestamptz", default: () => "now() + INTERVAL '7 days'" })
    expiresAt!: Date;

    @Column({ type: "timestamptz", nullable: true })
    acceptedAt!: Date | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;
}
