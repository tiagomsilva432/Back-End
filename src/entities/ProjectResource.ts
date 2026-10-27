import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from "typeorm";
import { Project } from "./Project.js";
import { User } from "./User.js";

/**
 * Something useful for the people on a project: a link (the repo, the test
 * server), a note, a file, or any mix of the three. The file lives in `files`
 * (kind resource_file), so it has no column here.
 */
@Entity("project_resources")
@Index("idx_project_resources_project", ["projectId"])
export class ProjectResource {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    @Column({ type: "uuid" })
    projectId!: string;

    @ManyToOne(() => Project, { onDelete: "CASCADE" })
    @JoinColumn({ name: "project_id" })
    project!: Project;

    @Column({ type: "varchar", length: 150 })
    title!: string;

    /** http or https only, checked by the DTO. */
    @Column({ type: "varchar", length: 2048, nullable: true })
    url!: string | null;

    @Column({ type: "text", nullable: true })
    note!: string | null;

    /** Who added it. An employee may only change their own. */
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
