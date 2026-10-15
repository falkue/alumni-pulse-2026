/** Kleine farbige Statusmarke (Pill). */
import type { ReactNode } from 'react';
import type { AccountStatus, SchoolAccessStatus } from '../../domain/types';
import { ACCESS_STATUS_LABEL, ACCOUNT_STATUS_LABEL } from '../format';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent' | 'demo';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

/** Status eines einzelnen Accounts. */
export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const tone = status === 'active' ? 'success' : status === 'invited' ? 'warning' : 'danger';
  return <Badge tone={tone}>{ACCOUNT_STATUS_LABEL[status]}</Badge>;
}

/** Zugangsstatus einer Hochschule (aus allen Accounts abgeleitet). */
export function AccessStatusBadge({ status }: { status: SchoolAccessStatus }) {
  const tone = status === 'active' ? 'success' : status === 'partial' ? 'warning' : 'neutral';
  return <Badge tone={tone}>{ACCESS_STATUS_LABEL[status]}</Badge>;
}
