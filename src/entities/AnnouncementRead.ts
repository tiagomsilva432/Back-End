import { Entity, PrimaryColumn, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { Announcement } from "./Announcement.js";
import { User } from "./User.js";

/** One row per person who read (or dismissed) an announcement. No row means unread. */
@Entity("announcement_reads")
export class AnnouncementRead {
    @PrimaryColumn({ type: "uuid" })
    announcementId!: string;

    @ManyToOne(() => Announcement, { onDelete: "CASCADE" })
    @JoinColumn({ name: "announcement_id" })
    announcement!: Announcement;

    @PrimaryColumn({ type: "uuid" })
    userId!: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "user_id" })
    user!: User;

    @CreateDateColumn({ type: "timestamptz" })
    readAt!: Date;
}
