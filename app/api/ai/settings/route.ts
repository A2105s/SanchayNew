import { z } from 'zod';
import { ok, readJson, handleRouteError } from '@/lib/cloud/http';
import { requirePermission } from '@/lib/cloud/context';
import { getAiSettings, saveAiSettings } from '@/lib/ai/settings';
import { writeAudit, newCorrelationId } from '@/lib/cloud/audit';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requirePermission(request, 'settings.manage');
    if (!auth.ok) return auth.response;
    return ok(await getAiSettings());
  } catch (error) {
    return handleRouteError('ai/settings', error);
  }
}

const putBody = z.object({
  enabled: z.boolean(),
  preferredProvider: z.enum(['auto', 'gemini', 'nvidia', 'openrouter', 'groq', 'mistral']),
  fallbackOrder: z.array(z.enum(['gemini', 'nvidia', 'openrouter', 'groq', 'mistral'])).max(5),
  shareRegistration: z.boolean(),
  features: z.object({ copilot: z.boolean(), draftRequest: z.boolean(), polish: z.boolean(), extractDocument: z.boolean(), pulse: z.boolean() })
});

export async function PUT(request: Request) {
  try {
    const auth = await requirePermission(request, 'settings.manage');
    if (!auth.ok) return auth.response;
    const before = await getAiSettings();
    const input = putBody.parse(await readJson(request));
    const saved = await saveAiSettings(input);
    await writeAudit(prisma, {
      entityType: 'AiSettings',
      entityId: 'ai_settings',
      action: 'AiSettingsUpdated',
      oldValue: JSON.stringify({ enabled: before.enabled, preferred: before.preferredProvider, shareRegistration: before.shareRegistration }),
      newValue: JSON.stringify({ enabled: saved.enabled, preferred: saved.preferredProvider, shareRegistration: saved.shareRegistration }),
      performedBy: auth.user.username,
      performedByRole: auth.user.role,
      organizationId: auth.user.organizationId,
      correlationId: newCorrelationId()
    });
    return ok(saved);
  } catch (error) {
    return handleRouteError('ai/settings', error);
  }
}
