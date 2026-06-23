import { type Brand } from '@event-driven-io/emmett';
import { randomUUID } from 'node:crypto';

export type MemberId = Brand<string, 'MemberId'>;
export const MemberId = {
  of: (value: string): MemberId => value as MemberId,
  random: (): MemberId => randomUUID() as MemberId,
} as const;
