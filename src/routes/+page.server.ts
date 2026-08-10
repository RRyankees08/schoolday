import { getDashboardEnvironment } from '$lib/server/dashboard/dashboard-environment';
import { getConfiguredDashboard } from '$lib/server/dashboard/dashboard-service';
import { getQuickLinks } from '$lib/server/dashboard/quick-links';

export async function load() {
  const environment = getDashboardEnvironment();
  return {
    dashboard: await getConfiguredDashboard(environment),
    quickLinks: getQuickLinks(environment)
  };
}
