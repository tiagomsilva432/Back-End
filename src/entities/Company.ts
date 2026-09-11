import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    OneToMany,
    Unique,
} from "typeorm";
import { User } from "./User.js";
import { Project } from "./Project.js";

@Entity("companies")
@Unique("uq_companies_tax_id", ["taxId"])
export class Company {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    @Column({ type: "varchar", length: 150 })
    name!: string;

    @Column({ type: "varchar", length: 50, nullable: true })
    taxId!: string | null;

    @Column({ type: "varchar", length: 255, nullable: true })
    email!: string | null;

    @Column({ type: "varchar", length: 2, default: "PT" })
    country!: string;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @OneToMany(() => User, (user) => user.company)
    users!: User[];

    @OneToMany(() => Project, (project) => project.company)
    projects!: Project[];
}
