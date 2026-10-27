import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from "typeorm";
import { ProjectTask } from "./ProjectTask.js";
import { User } from "./User.js";

/** One comment on a task card. Goes with the card when it is deleted. */
@Entity("project_task_comments")
@Index("idx_project_task_comments_task", ["taskId", "id"])
export class ProjectTaskComment {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    @Column({ type: "uuid" })
    taskId!: string;

    @ManyToOne(() => ProjectTask, { onDelete: "CASCADE" })
    @JoinColumn({ name: "task_id" })
    task!: ProjectTask;

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
