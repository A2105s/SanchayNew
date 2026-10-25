import 'server-only';

import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export interface CloudEventInput {
  operationId?: string;
  level: 'info' | 'error';
  category: string;
  action: string;
  status: 'started' | 'succeeded' | 'failed';
  message: string;
  recordCount?: number;
  details?: Prisma.InputJsonValue;
}

export function createOperationId(): string {
  return randomUUID();
}

export async function recordCloudEvent(input: CloudEventInput): Promise<string> {
  const operationId = input.operationId ?? createOperationId();

  if (input.level === 'error') {
    console.error('[cloud-event]', { ...input, operationId });
  } else {
    console.info('[cloud-event]', { ...input, operationId });
  }

  await prisma.backendEvent
    .create({
      data: {
        operationId,
        level: input.level,
        category: input.category,
        action: input.action,
        status: input.status,
        recordCount: input.recordCount,
        message: input.message,
        details: input.details
      }
    })
    .catch((error) => {
      console.error('[cloud-event:persist]', {
        operationId,
        action: input.action,
        error: error instanceof Error ? error.message : 'Unknown event persistence failure'
      });
    });

  return operationId;
}
