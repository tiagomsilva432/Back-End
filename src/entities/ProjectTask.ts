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
import { ENUM_COLUMN_LENGTH, TaskPriority, type TaskStatus } from "../types/enums.js";
import { Project } from "./Project.js";
import { User } from "./User.js";

/**
 * A card on a project's board. The column is the status, and the position
 * orders the cards inside it: gaps are fine, the move endpoint renumbers.
 * Attachments live in `files` (kind task_attachment).
 */
@Entity("project_tasks")
@Index("idx_project_tasks_board", ["projectId", "status", "position"])
export class ProjectTask {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    @Column({ type: "uuid" })
    projectId!: string;

    @ManyToOne(() => Project, { onDelete: "CASCADE" })
    @JoinColumn({ name: "project_id" })
    project!: Project;

    @Column({ type: "varchar", length: 150 })
    title!: string;

    @Column({ type: "text", nullable: true })
    description!: string | null;

    /** Not constrained by the database; guard with isTaskStatus before writing. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH })
    status!: TaskStatus;

    @Column({ type: "integer" })
    position!: number;

    /** Kept when they leave the project; nulled if the user is removed. */
    @Column({ type: "uuid", nullable: true })
    assigneeId!: string | null;

    @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
    @JoinColumn({ name: "assignee_id" })
    assignee!: User | null;

    @Column({ type: "date", nullable: true })
    dueDate!: string | null;

    /** Not constrained by the database; guard with isTaskPriority before writing. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH, default: TaskPriority.Medium })
    priority!: TaskPriority;

    /** Lowercase, trimmed and unique, cleaned by the DTO. */
    @Column({ type: "varchar", length: 30, array: true, default: () => "'{}'" })
    labels!: string[];

    /** Who created it. Deleting is for them, the manager or an admin. */
    @Column({ type: "uuid" })
    createdBy!: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "created_by" })
    createdByUser!: User;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;

    /** Set when it reaches done, cleared when it is reopened. */
    @Column({ type: "timestamptz", nullable: true })
    completedAt!: Date | null;
}
