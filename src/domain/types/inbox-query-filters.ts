/** Optional filters for GET /api/v1/inbox (C6 C7 C12 C13 C14). */
export interface InboxQueryFilters {
  unreadOnly?: boolean;
  unansweredOnly?: boolean;
  /** Free-text search against phoneNumber and funnel_users.name */
  searchQuery?: string;
  /** Normalized phone variants resolved from funnel name search */
  searchPhoneNumbers?: string[];
  /** C13 — filter by label slug (e.g. "interesado") */
  label?: string;
  /** C15 — include archived conversations (admin only) */
  includeArchived?: boolean;
}

export type InboxListFilter = 'unread' | 'unanswered';

export function buildInboxQueryFilters(input: {
  listFilter?: InboxListFilter;
  q?: string;
  searchPhoneNumbers?: string[];
  label?: string;
  includeArchived?: boolean;
}): InboxQueryFilters | undefined {
  const hasListFilter = input.listFilter !== undefined;
  const hasSearch = Boolean(input.q?.trim()) || Boolean(input.searchPhoneNumbers?.length);
  const hasLabel = Boolean(input.label?.trim());
  const hasArchived = input.includeArchived === true;

  if (!hasListFilter && !hasSearch && !hasLabel && !hasArchived) {
    return undefined;
  }

  return {
    ...(input.listFilter === 'unread' && { unreadOnly: true }),
    ...(input.listFilter === 'unanswered' && { unansweredOnly: true }),
    ...(input.q?.trim() && { searchQuery: input.q.trim() }),
    ...(input.searchPhoneNumbers?.length && { searchPhoneNumbers: input.searchPhoneNumbers }),
    ...(hasLabel && { label: input.label!.trim().toLowerCase() }),
    ...(hasArchived && { includeArchived: true }),
  };
}
