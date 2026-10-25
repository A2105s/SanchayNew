import { NextRequest, NextResponse } from 'next/server';
import { verifyLocalSignature } from '@/lib/cloud/storage';
import { readLocalDocumentByPath } from '@/lib/cloud/ops/documents';
import { handleRouteError } from '@/lib/cloud/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serves a stored document for the LOCAL filesystem driver. Access is authorized by a
 * short-lived HMAC signature issued by /documents/[docId]/url (which itself checks
 * document.read + org scope and logs access). No session cookie is required here because the
 * signature is the capability.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const path = sp.get('path');
    const exp = Number(sp.get('exp'));
    const sig = sp.get('sig');
    if (!path || !sig || !Number.isFinite(exp)) {
      return NextResponse.json({ success: false, error: 'Invalid document link.' }, { status: 400 });
    }
    if (!verifyLocalSignature(path, exp, sig)) {
      return NextResponse.json({ success: false, error: 'Document link is invalid or expired.' }, { status: 403 });
    }
    const { bytes, mimeType, title } = await readLocalDocumentByPath(path);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${title.replace(/[^a-zA-Z0-9._-]/gu, '_')}"`,
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error) {
    return handleRouteError('cloud/documents/file', error);
  }
}
