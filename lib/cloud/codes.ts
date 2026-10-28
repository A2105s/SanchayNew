import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

type TxClient = Prisma.TransactionClient | typeof prisma;

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function yearStart(): Date {
  return new Date(new Date().getFullYear(), 0, 1);
}

function yearSeqCode(count: number, prefix: string, width = 4): string {
  return `${prefix}-${new Date().getFullYear()}-${pad(count + 1, width)}`;
}

export async function nextTripCode(tx: TxClient = prisma): Promise<string> {
  const count = await tx.trip.count({ where: { createdAt: { gte: yearStart() } } });
  return yearSeqCode(count, 'TRIP', 5);
}

export async function nextTicketCode(tx: TxClient = prisma): Promise<string> {
  const count = await tx.maintenanceRecord.count({ where: { createdAt: { gte: yearStart() } } });
  return yearSeqCode(count, 'MT', 5);
}

export async function nextIncidentCode(tx: TxClient = prisma): Promise<string> {
  const count = await tx.incidentReport.count({ where: { createdAt: { gte: yearStart() } } });
  return yearSeqCode(count, 'INC', 5);
}

export async function nextTransferCode(tx: TxClient = prisma): Promise<string> {
  const count = await tx.transferRequest.count({ where: { createdAt: { gte: yearStart() } } });
  return yearSeqCode(count, 'TR');
}

export async function nextRequestCode(tx: TxClient = prisma): Promise<string> {
  const count = await tx.assetRequest.count({ where: { createdAt: { gte: yearStart() } } });
  return yearSeqCode(count, 'REQ', 5);
}

export async function nextAllocationCode(tx: TxClient = prisma): Promise<string> {
  const count = await tx.allocation.count({ where: { createdAt: { gte: yearStart() } } });
  return yearSeqCode(count, 'ALL', 5);
}

export async function nextAssetCode(tx: TxClient = prisma): Promise<string> {
  const count = await tx.vehicle.count();
  return `SCH-V-${pad(count + 1, 4)}`;
}

export async function nextSpaceCode(tx: TxClient = prisma): Promise<string> {
  const count = await tx.space.count();
  return `SCH-SP-${pad(count + 1, 4)}`;
}

export async function nextSpaceBookingCode(tx: TxClient = prisma): Promise<string> {
  const count = await tx.spaceBooking.count({ where: { createdAt: { gte: yearStart() } } });
  return yearSeqCode(count, 'SB', 4);
}
