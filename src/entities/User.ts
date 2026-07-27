import {
    Entity,
    PrimaryColumn,
    Generated,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
    ManyToOne,
    OneToMany,
    OneToOne,
    JoinColumn,
    Unique,
} from "typeorm";
import { bigintTransformer } from "./transformers.js";
import { ENUM_COLUMN_LENGTH, type UserRole, type UserStatus } from "../types/enums.js";
import { Company } from "./Company.js";
import { EmployeeProfile } from "./EmployeeProfile.js";
import { Salary } from "./Salary.js";
import { Allocation } from "./Allocation.js";
import { EmployeeSkill } from "./EmployeeSkill.js";

// Soft-deleted users keep occupying their (company, email) pair, so deletion
// must anonymize the email to deleted-{id}@anonymized.local (see schema notes).
// No separate index on companyId: the unique below already indexes
// (company_id, email), which Postgres uses for company_id lookups.
@Entity("users")
@Unique("uq_users_company_email", ["companyId", "email"])
@Unique("uq_users_signup_token", ["signupToken"])
export class User {
    @PrimaryColumn({ type: "bigint", transformer: bigintTransformer })
    @Generated("increment")
    id!: number;

    @Column({ type: "bigint", transformer: bigintTransformer })
    companyId!: number;

    @ManyToOne(() => Company, (company) => company.users, { onDelete: "CASCADE" })
    @JoinColumn({ name: "company_id" })
    company!: Company;

    /**
     * The work address provisioned for the employee, e.g.
     * tiago.m.silva@company1.com. This is the login identity. Its domain
     * belongs to exactly one company, which is why (company_id, email) can be
     * unique per tenant without two companies ever colliding.
     */
    @Column({ type: "varchar", length: 255 })
    email!: string;

    /**
     * NULL until step 2 of signup. This is the only "has no password yet"
     * marker: never write a placeholder hash here.
     */
    @Column({ type: "varchar", length: 255, nullable: true })
    passwordHash!: string | null;

    /**
     * Single-use token for the signup link. The link is sent to the employee's
     * personal address, which is not stored: the admin supplies it when
     * creating the account and it is only used to deliver the email.
     * Cleared once the password is set, which is what makes it single-use.
     * Multiple NULLs coexist under the unique constraint.
     */
    @Column({ type: "uuid", nullable: true })
    signupToken!: string | null;

    @Column({ type: "timestamptz", nullable: true })
    signupTokenExpiresAt!: Date | null;

    /** Validated in code via isUserRole - not constrained by the database. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH, default: "employee" })
    role!: UserRole;

    /** Validated in code via isUserStatus - not constrained by the database. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH, default: "invited" })
    status!: UserStatus;

    @Column({ type: "boolean", default: true })
    mustChangePassword!: boolean;

    @Column({ type: "timestamptz", nullable: true })
    emailVerifiedAt!: Date | null;

    @Column({ type: "timestamptz", nullable: true })
    lastLoginAt!: Date | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;

    @DeleteDateColumn({ type: "timestamptz", nullable: true })
    deletedAt!: Date | null;

    @OneToOne(() => EmployeeProfile, (profile) => profile.user)
    profile!: EmployeeProfile | null;

    @OneToMany(() => Salary, (salary) => salary.user)
    salaries!: Salary[];

    @OneToMany(() => Allocation, (allocation) => allocation.user)
    allocations!: Allocation[];

    @OneToMany(() => EmployeeSkill, (employeeSkill) => employeeSkill.user)
    skills!: EmployeeSkill[];
}
