import { json } from '@sveltejs/kit';
import { getDashboardEnvironment } from '$lib/server/dashboard/dashboard-environment';
import { getConfiguredDashboard } from '$lib/server/dashboard/dashboard-service';

export async function GET() {
  return json(await getConfiguredDashboard(getDashboardEnvironment()), {
    headers: {
      'cache-control': 'no-store'
    }
  });
}
