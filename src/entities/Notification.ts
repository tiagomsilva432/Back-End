import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from "typeorm";
import { Company } from "./Company.js";
import { User } from "./User.js";

/** Long enough for "review_request.declined" and whatever comes after it. */
export const NOTIFICATION_TYPE_LENGTH = 50;

/**
 * One notification for one person. The row is the source of truth: the live
 * stream only announces rows created while the person is connected, so nothing
 * is lost while they are offline.
 */
@Entity("notifications")
// The inbox: newest first by uuidv7 id, which is also the pagination cursor.
@Index("idx_notifications_recipient", ["recipientId", "id"])
@Index("idx_notifications_unread", ["recipientId"], { where: `"read_at" IS NULL` })
export class Notification {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    @Column({ type: "uuid" })
    recipientId!: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "recipient_id" })
    recipient!: User;

    /**
     * The company the event happened in, not necessarily the recipient's: a
     * system_admin lives in one company and acts in all of them. Reads filter
     * by recipient, never by this.
     */
    @Column({ type: "uuid" })
    companyId!: string;

    @ManyToOne(() => Company, { onDelete: "CASCADE" })
    @JoinColumn({ name: "company_id" })
    company!: Company;

    /** A key of the notification catalog. Not constrained by the database. */
    @Column({ type: "varchar", length: NOTIFICATION_TYPE_LENGTH })
    type!: string;

    /** The payload the catalog entry for this type describes. */
    @Column({ type: "jsonb" })
    data!: Record<string, unknown>;

    @Column({ type: "timestamptz", nullable: true })
    readAt!: Date | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;
}
