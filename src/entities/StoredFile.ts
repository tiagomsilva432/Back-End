import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from "typeorm";
import { ENUM_COLUMN_LENGTH, type FileKind } from "../types/enums.js";
import { Company } from "./Company.js";
import { User } from "./User.js";

/**
 * Um ficheiro enviado: um avatar, um recibo, um documento de uma ausência.
 * Os bytes estão no disco (services/files/storage.ts); aqui fica o que se sabe
 * deles. Chama-se StoredFile porque `File` já é um global do Node.
 *
 * O dono é polimórfico: o `kind` diz o que é o `ownerId` (um user, uma
 * despesa...), por isso não há FK para ele. Quem apaga o dono apaga os
 * ficheiros, e o files:sweep apanha o que escapar.
 */
@Entity("files")
@Index("idx_files_owner", ["kind", "ownerId"])
@Index("idx_files_hash", ["companyId", "kind", "sha256"])
export class StoredFile {
    @PrimaryColumn({ type: "uuid", default: () => "uuidv7()" })
    id!: string;

    /** A empresa do dono, copiada: é por ela que se procura um recibo repetido. */
    @Column({ type: "uuid" })
    companyId!: string;

    @ManyToOne(() => Company, { onDelete: "CASCADE" })
    @JoinColumn({ name: "company_id" })
    company!: Company;

    /** Not constrained by the database; guard with isFileKind before writing. */
    @Column({ type: "varchar", length: ENUM_COLUMN_LENGTH })
    kind!: FileKind;

    @Column({ type: "uuid" })
    ownerId!: string;

    /** O nome com que chegou, limpo. Só para mostrar: no disco o nome é o id. */
    @Column({ type: "varchar", length: 255 })
    originalName!: string;

    /** O tipo detetado pelos bytes, nunca o que o cliente disse. */
    @Column({ type: "varchar", length: 50 })
    mimeType!: string;

    /** O tamanho do que ficou guardado, depois de uma imagem ser reprocessada. */
    @Column({ type: "integer" })
    sizeBytes!: number;

    /** Dos bytes como chegaram, antes do sharp: o mesmo ficheiro dá sempre o mesmo hash. */
    @Column({ type: "char", length: 64 })
    sha256!: string;

    /** Relativa à pasta de uploads: {companyId}/{kind}/{id}.{ext}. */
    @Column({ type: "text" })
    storageKey!: string;

    /** Who sent it. Audit trail, so no inverse relation. */
    @Column({ type: "uuid" })
    uploadedBy!: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "uploaded_by" })
    uploadedByUser!: User;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;
}
