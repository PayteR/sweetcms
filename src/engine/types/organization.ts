export type OrgRole = 'owner' | 'admin' | 'member';

export interface OrgMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  createdAt: Date;
}

export interface OrgInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: OrgRole;
  status: 'pending' | 'accepted' | 'rejected' | 'canceled';
  inviterId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}
