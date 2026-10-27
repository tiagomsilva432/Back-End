import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from "typeorm";
import { Project } from "./Project.js";
import { User } from "./User.js";

/**
 * One message in a project's chat. The id is a uuidv7, which sorts by time:
 * it is the paging cursor and what the read markers compare against.
 */
@Entity("project_messages")
@Index("idx_project_messages_project", ["projectId", "id"])
export class ProjectMessage {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    @Column({ type: "uuid" })
    projectId!: string;

    @ManyToOne(() => Project, { onDelete: "CASCADE" })
    @JoinColumn({ name: "project_id" })
    project!: Project;

    @Column({ type: "uuid" })
    authorId!: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "author_id" })
    author!: User;

    @Column({ type: "text" })
    body!: string;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    /** Null until the author edits it. */
    @Column({ type: "timestamptz", nullable: true })
    editedAt!: Date | null;
}
