import { Entity, PrimaryColumn, Column, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { Project } from "./Project.js";
import { User } from "./User.js";

/**
 * How far one person has read a project's chat. Everything from someone else
 * with a greater id is unread; no row means all of it is.
 */
@Entity("project_message_reads")
export class ProjectMessageRead {
    @PrimaryColumn({ type: "uuid" })
    projectId!: string;

    @ManyToOne(() => Project, { onDelete: "CASCADE" })
    @JoinColumn({ name: "project_id" })
    project!: Project;

    @PrimaryColumn({ type: "uuid" })
    userId!: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "user_id" })
    user!: User;

    /** No FK on purpose: deleting that message must not take the marker with it. */
    @Column({ type: "uuid" })
    lastReadMessageId!: string;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}
