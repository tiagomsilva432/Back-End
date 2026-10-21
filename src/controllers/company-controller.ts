import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type {
    CompanyResponse,
    CreateCompanyRequest,
    PatchCompanyRequest,
} from "../dtos/company/company-dto.js";
import { Company } from "../entities/Company.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import {
    createCompany as saveCompany,
    getCompanies,
    getCompanyById,
    getCompanyByTaxId,
    updateCompany,
} from "../repositories/company-repo.js";
import { UserRole } from "../types/enums.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Empresa não encontrada";

const toResponse = (company: Company): CompanyResponse => ({
    id: company.id,
    name: company.name,
    taxId: company.taxId,
    email: company.email,
    country: company.country,
});

export const createCompany = async (req: Request, res: Response) => {
    const { name, taxId, email, country } = req.body as CreateCompanyRequest;

    if (taxId) {
        const existing: Company | null = await getCompanyByTaxId(taxId);

        if (existing) {
            throw new HttpError(409, "Já existe uma empresa com este NIF");
        }
    }

    const created: Company = await saveCompany(
        new Company(name, taxId ?? null, email ?? null, country),
    );

    return new HttpResponse(201, "Empresa criada", undefined, toResponse(created)).send(res);
}

export const listCompanies = async (_req: Request, res: Response) => {
    const companies = await getCompanies();

    return new HttpResponse(200, "Empresas", undefined, companies.map(toResponse)).send(res);
}

export const getCompany = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    if (actor.role !== UserRole.SystemAdmin && id !== actor.companyId) {
        throw new HttpError(404, NOT_FOUND);
    }

    const company = await getCompanyById(id);

    if (!company) {
        throw new HttpError(404, NOT_FOUND);
    }

    return new HttpResponse(200, "Empresa", undefined, toResponse(company)).send(res);
}

export const patchCompany = async (req: Request, res: Response) => {
    const body = req.body as PatchCompanyRequest;
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    if (actor.role !== UserRole.SystemAdmin && id !== actor.companyId) {
        throw new HttpError(404, NOT_FOUND);
    }

    const company = await getCompanyById(id);

    if (!company) {
        throw new HttpError(404, NOT_FOUND);
    }

    // O NIF identifica o tenant, e foi o system_admin quem o registou.
    if (body.taxId !== undefined && actor.role !== UserRole.SystemAdmin) {
        throw new HttpError(403, "Só o system_admin altera o NIF");
    }

    if (body.taxId && body.taxId !== company.taxId) {
        const sameTaxId = await getCompanyByTaxId(body.taxId);

        if (sameTaxId && sameTaxId.id !== company.id) {
            throw new HttpError(409, "Já existe uma empresa com este NIF");
        }
    }

    if (body.name !== undefined) {
        company.name = body.name;
    }

    if (body.taxId !== undefined) {
        company.taxId = body.taxId;
    }

    if (body.email !== undefined) {
        company.email = body.email;
    }

    if (body.country !== undefined) {
        company.country = body.country;
    }

    const saved = await updateCompany(company);

    return new HttpResponse(200, "Empresa atualizada", undefined, toResponse(saved)).send(res);
}
