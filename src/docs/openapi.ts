import { createDocument } from "zod-openapi";
import { createAccountSchema } from "../dtos/auth/account-dto.js";
import { loginResponseSchema, loginSchema } from "../dtos/auth/login-dto.js";
import { meResponseSchema } from "../dtos/auth/me-dto.js";
import { createCompanySchema } from "../dtos/company/company-dto.js";
import { createProjectSchema } from "../dtos/project/project-dto.js";
import { upsertEmployeeProfileSchema } from "../dtos/user/employee-profile-dto.js";
import { createAllocationSchema } from "../dtos/allocation/allocation-dto.js";
import { changePasswordSchema, confirmPasswordResetSchema, requestPasswordResetSchema } from "../dtos/auth/password-dto.js";
import { healthPaths } from "../routes/health-routes.js";
import { authPaths } from "../routes/auth-routes.js";
import { companyPaths } from "../routes/company-routes.js";
import { projectPaths } from "../routes/project-routes.js";
import { userPaths } from "../routes/user-routes.js";
import { allocationPaths } from "../routes/allocation-routes.js";
import { skillPaths } from "../routes/skill-routes.js";
import { salaryPaths } from "../routes/salary-routes.js";
import { reviewPaths } from "../routes/review-routes.js";
import { announcementPaths } from "../routes/announcement-routes.js";
import { notificationPaths } from "../routes/notification-routes.js";
import { absencePaths } from "../routes/absence-routes.js";
import { calendarPaths } from "../routes/calendar-routes.js";
import { docsPaths } from "./docs-paths.js";

export const openApiDocument: ReturnType<typeof createDocument> = createDocument({
    openapi: "3.1.0",
    info: {
        title: "API - Projeto Final",
        version: "1.0.0",
        description: "Documentação gerada a partir dos schemas Zod (DTOs).",
    },
    servers: [
        {
            url: `${process.env.BASE_URL ?? "http://localhost"}:${process.env.PORT ?? 3000}`,
            description: "Servidor local",
        },
    ],
    tags: [
        { name: "Sistema", description: "Estado e diagnóstico da API" },
        { name: "Auth", description: "Autenticação e gestão de contas" },
        { name: "Empresas", description: "Gestão de empresas" },
        { name: "Projetos", description: "Gestão de projetos" },
        { name: "Utilizadores", description: "Diretório de pessoas e perfis" },
        { name: "Alocações", description: "Quem trabalha em quê" },
        { name: "Competências", description: "O catálogo de competências e quem as tem" },
        { name: "Salários", description: "Histórico de salários de cada pessoa" },
        { name: "Avaliações", description: "Avaliações entre colegas para decidir aumentos" },
        { name: "Avisos", description: "Avisos do sistema, de uma empresa ou de um projeto" },
        { name: "Notificações", description: "A caixa de cada pessoa, e o stream em direto" },
        { name: "Ausências", description: "Pedidos de férias, baixas e outras ausências, e quem os aprova" },
        { name: "Calendário", description: "Feriados e ausências, da empresa ou de um projeto" },
    ],
    paths: {
        ...healthPaths,
        ...docsPaths,
        ...authPaths,
        ...companyPaths,
        ...projectPaths,
        ...userPaths,
        ...allocationPaths,
        ...skillPaths,
        ...salaryPaths,
        ...reviewPaths,
        ...announcementPaths,
        ...notificationPaths,
        ...absencePaths,
        ...calendarPaths,
    },
    components: {
        schemas: {
            LoginRequest: loginSchema,
            LoginResponse: loginResponseSchema,
            CreateAccountRequest: createAccountSchema,
            MeResponse: meResponseSchema,
            CreateCompanyRequest: createCompanySchema,
            CreateProjectRequest: createProjectSchema,
            UpsertEmployeeProfileRequest: upsertEmployeeProfileSchema,
            CreateAllocationRequest: createAllocationSchema,
            ChangePasswordRequest: changePasswordSchema,
            RequestPasswordResetRequest: requestPasswordResetSchema,
            ConfirmPasswordResetRequest: confirmPasswordResetSchema,
        },
        securitySchemes: {
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
            },
        },
    },
});
