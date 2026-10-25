import 'server-only';

import { prisma } from '@/lib/db/prisma';
import type { DocumentView, SessionUser } from '@/types';
import { writeAudit } from '@/lib/cloud/audit';
import { DomainError } from '@/lib/cloud/errors';
import { mapDocument } from '@/lib/cloud/mappers';
import { orgTree } from '@/lib/auth/scope';
import { can } from '@/lib/auth/roles';
import {
  assertAllowedMime,
  assertWithinSizeLimit,
  getStorageDriver,
  sanitizeFilename,
  SupabaseStorageDriver
} from '@/lib/cloud/storage';
import type { DocumentMetaParsed } from '@/lib/validation/schemas';

/** A vehicle must be within the caller's own org tree to touch its documents (404 otherwise). */
async function assertVehicleInScope(user: SessionUser, vehicleId: string): Promise<string> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { organizationId: true } });
  if (!vehicle) throw new DomainError('Vehicle not found.', 404);
  const tree = await orgTree(user);
  if (tree !== null && !tree.includes(vehicle.organizationId)) throw new DomainError('Vehicle not found.', 404);
  return vehicle.organizationId;
}

export async function listDocuments(user: SessionUser, vehicleId: string): Promise<DocumentView[]> {
  await assertVehicleInScope(user, vehicleId);
  const rows = await prisma.vehicleDocument.findMany({ where: { vehicleId }, orderBy: { createdAt: 'desc' } });
  return rows.map(mapDocument);
}

export async function uploadDocument(user: SessionUser, vehicleId: string, meta: DocumentMetaParsed, correlationId: string): Promise<DocumentView> {
  const orgId = await assertVehicleInScope(user, vehicleId);
  if (!can(user.role, 'document.write')) throw new DomainError('You do not have permission to upload documents.', 403);

  assertAllowedMime(meta.mimeType);
  assertWithinSizeLimit(meta.sizeBytes);

  let bytes: Buffer;
  try {
    bytes = Buffer.from(meta.contentBase64, 'base64');
  } catch {
    throw new DomainError('Document content is not valid base64.', 400);
  }
  assertWithinSizeLimit(bytes.length);

  const safeName = sanitizeFilename(meta.title);
  const objectPath = `${vehicleId}/${Date.now()}-${safeName}`;
  const driver = getStorageDriver();
  await driver.put(objectPath, bytes, meta.mimeType);

  const doc = await prisma.$transaction(async (tx) => {
    const created = await tx.vehicleDocument.create({
      data: {
        vehicleId,
        kind: meta.kind,
        title: meta.title,
        storagePath: objectPath,
        mimeType: meta.mimeType,
        sizeBytes: bytes.length,
        uploadedBy: user.username,
        expiresAt: meta.expiresAt ? new Date(meta.expiresAt) : null
      }
    });
    await writeAudit(tx, { entityType: 'Document', entityId: created.id, action: 'DocumentUploaded', newValue: meta.title, performedBy: user.username, performedByRole: user.role, organizationId: orgId, correlationId, reason: meta.kind });
    return created;
  });

  return mapDocument(doc);
}

export interface SignedUrlResult {
  url: string;
  expiresInSeconds: number;
}

/** Produces a short-lived signed URL and logs the access. Requires document.read + scope. */
export async function getDocumentSignedUrl(user: SessionUser, documentId: string, correlationId: string): Promise<SignedUrlResult> {
  if (!can(user.role, 'document.read')) throw new DomainError('You do not have permission to read documents.', 403);
  const doc = await prisma.vehicleDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw new DomainError('Document not found.', 404);
  await assertVehicleInScope(user, doc.vehicleId);

  const driver = getStorageDriver();
  let url: string;
  if (driver instanceof SupabaseStorageDriver) {
    url = await driver.createSignedUrl(doc.storagePath);
  } else {
    const path = driver.signedPath(doc.storagePath);
    if (!path) throw new DomainError('Signed URL could not be created.', 500);
    url = path;
  }

  await prisma.documentAccessLog.create({ data: { documentId, accessedBy: user.username, action: 'SIGN_URL' } });
  await writeAudit(prisma, { entityType: 'Document', entityId: documentId, action: 'DocumentUrlIssued', performedBy: user.username, performedByRole: user.role, organizationId: null, correlationId });

  return { url, expiresInSeconds: 300 };
}

/** Streams the raw bytes for the local-filesystem driver after the HMAC signature is verified by the route. */
export async function readLocalDocumentByPath(storagePath: string): Promise<{ bytes: Buffer; mimeType: string; title: string }> {
  const doc = await prisma.vehicleDocument.findFirst({ where: { storagePath } });
  if (!doc) throw new DomainError('Document not found.', 404);
  const driver = getStorageDriver();
  const bytes = await driver.get(storagePath);
  // Record the actual content read (distinct from issuing the URL).
  await prisma.documentAccessLog.create({ data: { documentId: doc.id, accessedBy: 'signed-url', action: 'READ' } }).catch(() => undefined);
  return { bytes, mimeType: doc.mimeType, title: doc.title };
}
