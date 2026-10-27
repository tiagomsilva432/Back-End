import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Unique,
} from "typeorm";
import { Company } from "./Company.js";
import { User } from "./User.js";

/**
 * A day off that only one company has: the municipal holiday, Carnival, a
 * closure on the 24th. National holidays are not stored: they are worked out
 * in code from the company's country (see services/holidays.ts).
 */
@Entity("company_holidays")
@Unique("uq_company_holidays_company_date", ["companyId", "date"])
export class CompanyHoliday {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    @Column({ type: "uuid" })
    companyId!: string;

    @ManyToOne(() => Company, { onDelete: "CASCADE" })
    @JoinColumn({ name: "company_id" })
    company!: Company;

    @Column({ type: "date" })
    date!: string;

    @Column({ type: "varchar", length: 150 })
    name!: string;

    /** Who added it. Audit trail, so no inverse relation. */
    @Column({ type: "uuid" })
    createdBy!: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "created_by" })
    createdByUser!: User;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;
}
