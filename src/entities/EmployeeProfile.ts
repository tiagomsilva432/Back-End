import {
    Entity,
    PrimaryColumn,
    Column,
    UpdateDateColumn,
    OneToOne,
    JoinColumn,
} from "typeorm";
import { bigintTransformer } from "./transformers.js";
import { User } from "./User.js";

// Shares its primary key with users: one profile per user, no surrogate id.
@Entity("employee_profiles")
export class EmployeeProfile {
    @PrimaryColumn({ type: "bigint", transformer: bigintTransformer })
    userId!: number;

    @OneToOne(() => User, (user) => user.profile, { onDelete: "CASCADE" })
    @JoinColumn({ name: "user_id" })
    user!: User;

    @Column({ type: "varchar", length: 100 })
    firstName!: string;

    @Column({ type: "varchar", length: 100 })
    lastName!: string;

    @Column({ type: "varchar", length: 30, nullable: true })
    phone!: string | null;

    @Column({ type: "text", nullable: true })
    address!: string | null;

    // DATE columns are surfaced as 'YYYY-MM-DD' strings: no timezone to get wrong.
    @Column({ type: "date", nullable: true })
    birthDate!: string | null;

    @Column({ type: "date" })
    hireDate!: string;

    @Column({ type: "varchar", length: 100, nullable: true })
    jobTitle!: string | null;

    @Column({ type: "text", nullable: true })
    avatarUrl!: string | null;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}
