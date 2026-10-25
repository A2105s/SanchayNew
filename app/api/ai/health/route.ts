import { ok } from '@/lib/cloud/http';
import { requirePermission } from '@/lib/cloud/context';
import { handleRouteError } from '@/lib/cloud/http';
import { can } from '@/lib/auth/roles';
import { DEFAULT_ORDER, PROVIDERS, anyConfigured, ping } from '@/lib/ai/providers';
import { getAiSettings } from '@/lib/ai/settings';
import type { AiHealthResult, AiProviderHealth } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET: engine health. Everyone gets {enabled, anyConfigured}; only settings.manage sees per-engine detail. */
export async function GET(request: Request) {
  try {
    const auth = await requirePermission(request);
    if (!auth.ok) return auth.response;
    const settings = await getAiSettings();
    const detailed = can(auth.user.role, 'settings.manage');
    const live = new URL(request.url).searchParams.get('ping') !== '0';
    let providers: AiProviderHealth[] = [];
    if (detailed) {
      providers = live
        ? await Promise.all(DEFAULT_ORDER.map((id) => ping(id)))
        : DEFAULT_ORDER.map((id) => ({ id, name: PROVIDERS[id].name, model: PROVIDERS[id].model(), configured: PROVIDERS[id].key().length > 0, vision: PROVIDERS[id].vision, ok: false, status: 0, latencyMs: 0, message: PROVIDERS[id].key() ? 'Not checked' : 'Not configured' }));
    }
    const out: AiHealthResult = { enabled: settings.enabled, anyConfigured: anyConfigured(), features: settings.features, providers };
    return ok(out);
  } catch (error) {
    return handleRouteError('ai/health', error);
  }
}
