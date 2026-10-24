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
import { type AnnouncementScope, AnnouncementSeverity, ENUM_COLUMN_LENGTH } from "../types/enums.js";
import { Company } from "./Company.js";
import { Project } from "./Project.js";
import { User } from "./User.js";

/**
 * A one-way message. The scope decides the audience: everyone (system), one
 * company, or the people involved in one project. Project announcements copy
 * the project's companyId, so the company filter never needs a join.
 */
@Entity("announcements")
@Check(
    "ck_announcements_scope",
    `("scope" = 'system' AND "company_id" IS NULL AND "project_id" IS NULL)`
    + ` OR ("scope" = 'company' AND "company_id" IS NOT NULL AND "project_id" IS NULL)`
    + ` OR ("scope" = 'project' AND "company_id" IS NOT NULL AND "project_id" IS NOT NULL)`,
)
@Check("ck_announcements_window", `"ends_at" IS NULL OR "ends_at" > "starts_at"`)
@Index("idx_announcements_company", ["companyId"])
@Index("idx_announcements_project", ["projectId"])
export class Announcement {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    /** Not constrained by the database beyond the check; guard with isAnnouncementScope. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH })
    scope!: AnnouncementScope;

    /** Null only for system announcements. */
    @Column({ type: "uuid", nullable: true })
    companyId!: string | null;

    @ManyToOne(() => Company, { onDelete: "CASCADE", nullable: true })
    @JoinColumn({ name: "company_id" })
    company!: Company | null;

    @Column({ type: "uuid", nullable: true })
    projectId!: string | null;

    @ManyToOne(() => Project, { onDelete: "CASCADE", nullable: true })
    @JoinColumn({ name: "project_id" })
    project!: Project | null;

    /** Who posted it. Audit trail, so no inverse relation. */
    @Column({ type: "uuid" })
    createdBy!: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "created_by" })
    createdByUser!: User;

    @Column({ type: "varchar", length: 150 })
    title!: string;

    @Column({ type: "text" })
    body!: string;

    /** Not constrained by the database; guard with isAnnouncementSeverity before writing. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH, default: AnnouncementSeverity.Info })
    severity!: AnnouncementSeverity;

    @Column({ type: "boolean", default: false })
    pinned!: boolean;

    /** Hidden before this moment: lets a maintenance warning go up ahead of time. */
    @Column({ type: "timestamptz", default: () => "now()" })
    startsAt!: Date;

    /** Null means it stays up until someone removes it. */
    @Column({ type: "timestamptz", nullable: true })
    endsAt!: Date | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}
