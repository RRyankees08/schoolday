import { json } from '@sveltejs/kit';
import { getDashboardEnvironment } from '$lib/server/dashboard/dashboard-environment';
import { ensureDashboardStorage } from '$lib/server/dashboard/dashboard-service';

export function GET() {
  const storage = ensureDashboardStorage(getDashboardEnvironment());
  return json(
    { status: 'ok', storage },
    {
      headers: {
        'cache-control': 'no-store'
      }
    }
  );
}
