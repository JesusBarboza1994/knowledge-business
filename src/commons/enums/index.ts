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
 * NOTE — regular knowledge note. Hangs from a MAIN note via `parent`.
 * MAIN — a main branch of the area: a top-level subject the index lists by default.
 *        Everything else in the area is reached by drilling into one of these.
 * INDEX — the area's Map of Content (navigation entry point); one per area.
 * LOG — the area's append-only activity log; one per area.
 */
export enum NoteKind {
  NOTE = 'note',
  MAIN = 'main',
  INDEX = 'index',
  LOG = 'log',
}

/**
 * Kinds a caller may create or assign. INDEX and LOG are scaffolded by the server, one per
 * area, and must never be minted by an agent — a second index would split navigation in two.
 */
export const WRITABLE_NOTE_KINDS = [NoteKind.NOTE, NoteKind.MAIN] as const

/** System pages are area-scoped singletons: they cannot be moved between areas nor deleted. */
export function isSystemKind(kind: string): boolean {
  return kind === NoteKind.INDEX || kind === NoteKind.LOG
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

/** What a single-use emailed token authorizes. Each purpose has its own lifetime (AUTH_TOKEN_TTL_MS). */
export enum AuthTokenPurpose {
  VERIFY_EMAIL = 'verify_email',
  RESET_PASSWORD = 'reset_password',
  INVITE = 'invite',
}
