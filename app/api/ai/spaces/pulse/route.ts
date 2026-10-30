import { ok } from '@/lib/cloud/http';
import { prisma } from '@/lib/db/prisma';
import { generate } from '@/lib/ai/providers';
import { SPACE_PULSE_SYSTEM } from '@/lib/ai/prompts';
import { aiRoute, logAi, metaOf, parseJsonObject } from '@/lib/ai/route';
import { searchSpaces } from '@/lib/cloud/ops/spaces';
import { loadSpaceSettings } from '@/lib/cloud/ops/space-settings';
import type { SpacePulseAction, SpacePulseResponse } from '@/types/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED_LINKS = new Set([
  '/spaces',
  '/spaces/bookings',
  '/spaces/bookings?bucket=pending',
  '/spaces/requests',
  '/spaces/settings'
]);

const cache = new Map<string, { at: number; value: SpacePulseResponse }>();
const TTL = 5 * 60_000;

export async function GET(request: Request) {
  return aiRoute(
    request,
    'ai/spaces/pulse',
    'pulse',
    async ({ user, settings }) => {
      const force = new URL(request.url).searchParams.get('refresh') === '1';
      const hit = cache.get(user.username);
      if (hit && !force && Date.now() - hit.at < TTL) return ok(hit.value);

      const spaceSettings = await loadSpaceSettings();
      const allSpaces = await searchSpaces(user, {});
      const spaces = allSpaces.spaces;

      const idleSpaces = spaces.filter((s) => (s.idleDays ?? 0) >= spaceSettings.idleAlertDays);
      const busyNow = spaces.filter((s) => s.busyNow);
      const blockedMaint = spaces.filter((s) => s.blockedByMaintenance);

      const pendingBookingsCount = await prisma.spaceBooking.count({
        where: { status: 'PENDING' }
      });

      const factsText = [
        `Total Civic Spaces: ${spaces.length}`,
        `Idle >= ${spaceSettings.idleAlertDays} Days: ${idleSpaces.length} (${idleSpaces.map((s) => `${s.name} [${s.category}, idle ${s.idleDays}d]`).join(', ') || 'None'})`,
        `Currently In Use: ${busyNow.length} (${busyNow.map((s) => s.name).join(', ') || 'None'})`,
        `Blocked by Maintenance: ${blockedMaint.length} (${blockedMaint.map((s) => s.name).join(', ') || 'None'})`,
        `Pending Booking Decisions: ${pendingBookingsCount}`
      ].join('\n');

      const result = await generate(
        [
          { role: 'system', content: SPACE_PULSE_SYSTEM },
          { role: 'user', content: `DATA (untrusted facts):\n<<<DATA\n${factsText}\nDATA>>>` }
        ],
        {
          preferred: settings.preferredProvider,
          order: settings.fallbackOrder,
          maxTokens: 500,
          temperature: 0.2,
          json: true
        }
      );

      const parsed = result.text ? parseJsonObject(result.text) : null;
      let response: SpacePulseResponse;

      if (parsed && typeof parsed.summary === 'string') {
        const highlights = Array.isArray(parsed.highlights)
          ? parsed.highlights.filter((h): h is string => typeof h === 'string').slice(0, 5)
          : [];

        const recs: SpacePulseAction[] = (Array.isArray(parsed.recommendations) ? parsed.recommendations : [])
          .map((r) => r as Record<string, unknown>)
          .filter((r) => typeof r.label === 'string' && typeof r.href === 'string')
          .slice(0, 4)
          .map((r) => ({
            label: String(r.label).slice(0, 80),
            href: ALLOWED_LINKS.has(String(r.href)) ? String(r.href) : '/spaces',
            priority: (['high', 'medium', 'low'].includes(String(r.priority)) ? r.priority : 'medium') as SpacePulseAction['priority']
          }));

        response = {
          ...metaOf(result),
          summary: parsed.summary.slice(0, 500),
          idleCount: idleSpaces.length,
          busyCount: busyNow.length,
          blockedCount: blockedMaint.length,
          highlights,
          recommendations: recs.length ? recs : [
            { label: 'View idle spaces for activation', href: '/spaces', priority: 'medium' },
            { label: 'Review pending booking queue', href: '/spaces/bookings?bucket=pending', priority: 'high' }
          ],
          generatedAt: new Date().toISOString()
        };
      } else {
        // Deterministic fallback
        response = {
          ...metaOf({ ...result, degraded: true }),
          summary: `Facility summary: ${spaces.length} spaces registered across your jurisdiction. ${idleSpaces.length} facilities have been idle for ${spaceSettings.idleAlertDays}+ days, while ${busyNow.length} are in active use today.`,
          idleCount: idleSpaces.length,
          busyCount: busyNow.length,
          blockedCount: blockedMaint.length,
          highlights: [
            `${idleSpaces.length} public spaces idle for >= ${spaceSettings.idleAlertDays} days (candidates for inter-department activation).`,
            `${pendingBookingsCount} booking requests waiting for managerial approval.`,
            `${blockedMaint.length} facilities blocked by emergency or active maintenance.`
          ],
          recommendations: [
            { label: 'Decide pending bookings', href: '/spaces/bookings?bucket=pending', priority: 'high' },
            { label: 'Explore idle spaces catalogue', href: '/spaces', priority: 'medium' }
          ],
          generatedAt: new Date().toISOString()
        };
      }

      await logAi('spaces/pulse', response);
      if (!response.degraded) cache.set(user.username, { at: Date.now(), value: response });
      return ok(response);
    },
    'fleet.read'
  );
}

