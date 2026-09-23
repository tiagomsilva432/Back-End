import {
    Entity,
    PrimaryColumn,
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
import { ENUM_COLUMN_LENGTH, UserRole, UserStatus } from "../types/enums.js";
import { Company } from "./Company.js";
import { EmployeeProfile } from "./EmployeeProfile.js";
import { Salary } from "./Salary.js";
import { Allocation } from "./Allocation.js";
import { EmployeeSkill } from "./EmployeeSkill.js";
import { randomUUID } from "node:crypto";
import { signupTokenExpDate } from "../env-vars.js";

// Soft-deleted users keep occupying their (company, email) pair, so deletion
// must anonymize the email to deleted-{id}@anonymized.local (see schema notes).
// No separate index on companyId: the unique below already indexes
// (company_id, email), which Postgres uses for company_id lookups.
@Entity("users")
@Unique("uq_users_company_email", ["companyId", "email"])
@Unique("uq_users_signup_token", ["signupToken"])
export class User {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    @Column({ type: "uuid" })
    companyId!: string;

    @ManyToOne(() => Company, (company) => company.users, { onDelete: "CASCADE" })
    @JoinColumn({ name: "company_id" })
    company!: Company;

    @Column({ type: "varchar", length: 255 })
    email!: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    passwordHash!: string | null;

    @Column({ type: "uuid", nullable: true })
    signupToken!: string | null;

    @Column({ type: "timestamptz", nullable: true })
    signupTokenExpiresAt!: Date | null;

    /** Not constrained by the database; guard with isUserRole before writing. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH, default: UserRole.Employee })
    role!: UserRole;

    /** Not constrained by the database; guard with isUserStatus before writing. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH, default: UserStatus.Invited })
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

    constructor (companyId: string, email: string, role: UserRole = UserRole.Employee) {
        this.companyId = companyId;
        this.email = email;
        this.role = role;
        const invited = role === UserRole.Employee;
        this.signupToken = invited ? randomUUID() : null;
        this.signupTokenExpiresAt = invited ? new Date(Date.now()+signupTokenExpDate()) : null;
    }
}
