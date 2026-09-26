export const APP_ROLES = ['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export interface AuthenticatedPrincipal {
  id: string;
  email: string | null;
  role: AppRole;
}
