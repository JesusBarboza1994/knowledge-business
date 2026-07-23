/** Per-area access level of a user membership. */
export enum AreaAccess {
  READ = 'read',
  WRITE = 'write',
  MANAGE = 'manage',
}

/**
 * Management role, not content access:
 * MEMBER — content access via memberships only.
 * ADMIN — manages users and content within their tenant.
 * SUPERADMIN — creates organizations, manages globally (reserved).
 */
export enum UserRole {
  MEMBER = 'member',
  ADMIN = 'admin',
  SUPERADMIN = 'superadmin',
}

/** Visibility of a note beyond its own area. */
export enum Sensitivity {
  PUBLIC_ORG = 'public_org',
  INTERNAL_AREA = 'internal_area',
  CONFIDENTIAL = 'confidential',
}

/**
 * NOTE — regular knowledge note.
 * INDEX — the area's Map of Content (navigation entry point); one per area.
 * LOG — the area's append-only activity log; one per area.
 */
export enum NoteKind {
  NOTE = 'note',
  INDEX = 'index',
  LOG = 'log',
}

/** Lifecycle of content records (notes, areas). */
export enum ContentStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum UserStatus {
  ACTIVE = 'active',
  INVITED = 'invited',
  INACTIVE = 'inactive',
}

export enum OrganizationStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}

export enum OrganizationPlan {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

/** Direction when traversing a note's [[links]]. */
export enum LinkDirection {
  OUT = 'out',
  IN = 'in',
  BOTH = 'both',
}
