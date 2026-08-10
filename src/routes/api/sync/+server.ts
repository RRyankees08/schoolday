import { json } from '@sveltejs/kit';
import { getDashboardEnvironment } from '$lib/server/dashboard/dashboard-environment';
import { getConfiguredDashboard } from '$lib/server/dashboard/dashboard-service';

export async function POST() {
  const dashboard = await getConfiguredDashboard(getDashboardEnvironment(), { forceRefresh: true });
  return json(dashboard, { headers: { 'cache-control': 'no-store' } });
}
