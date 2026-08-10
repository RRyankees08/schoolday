<script lang="ts">
  import CurrentPeriodHero from '$lib/components/CurrentPeriodHero.svelte';
  import DailySchedule from '$lib/components/DailySchedule.svelte';
  import DashboardHeader from '$lib/components/DashboardHeader.svelte';
  import GradeChangeFeed from '$lib/components/GradeChangeFeed.svelte';
  import GradeOverview from '$lib/components/GradeOverview.svelte';
  import PriorityAssignments from '$lib/components/PriorityAssignments.svelte';
  import SyncNotice from '$lib/components/SyncNotice.svelte';
  import UpcomingAssignments from '$lib/components/UpcomingAssignments.svelte';
  import type { DashboardData } from '$lib/models';

  let { data } = $props();
  let refreshedDashboard = $state<DashboardData | null>(null);
  const dashboard = $derived(refreshedDashboard ?? data.dashboard);
  const liveProviders = $derived(
    dashboard.syncStatus.filter((status) => status.status === 'live').map((status) => status.label)
  );
  const fixtureProviders = $derived(
    dashboard.syncStatus
      .filter((status) => status.status === 'fixture')
      .map((status) => status.label)
  );
</script>

<svelte:head>
  <title>SchoolDay · What matters right now</title>
  <meta
    name="description"
    content="Your current class, priority assignments, grade changes, and daily schedule in one calm briefing."
  />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" href="/schoolday-icon.svg" type="image/svg+xml" />
  <meta name="application-name" content="SchoolDay" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="SchoolDay" />
</svelte:head>

<main class="dashboard-shell">
  <DashboardHeader
    displayName={dashboard.displayName}
    generatedAt={dashboard.generatedAt}
    schoolDay={dashboard.schoolDay}
    syncStatus={dashboard.syncStatus}
    onRefreshed={(refreshed) => (refreshedDashboard = refreshed)}
  />

  <SyncNotice generatedAt={dashboard.generatedAt} syncStatus={dashboard.syncStatus} />

  <CurrentPeriodHero schoolDay={dashboard.schoolDay} initialState={dashboard.scheduleState} />

  <div class="dashboard-grid">
    <PriorityAssignments assignments={dashboard.priorityAssignments} />
    <GradeChangeFeed
      changes={dashboard.gradeChanges}
      courses={dashboard.courses}
      generatedAt={dashboard.generatedAt}
    />
    <GradeOverview grades={dashboard.grades} />
  </div>

  <div class="detail-grid">
    <DailySchedule schoolDay={dashboard.schoolDay} state={dashboard.scheduleState} />
    <UpcomingAssignments
      assignments={dashboard.upcomingAssignments}
      generatedAt={dashboard.generatedAt}
    />
  </div>

  <footer class="dashboard-footer">
    <span>SchoolDay integration preview</span>
    <span class="provider-summary">
      {liveProviders.length > 0
        ? `${liveProviders.join(' · ')}${fixtureProviders.length > 0 ? ` · ${fixtureProviders.join(' · ')}` : ''}`
        : 'All data shown is realistic fixture data · No external accounts connected'}
    </span>
    {#if data.quickLinks.length > 0}
      <nav class="quick-links" aria-label="School services">
        {#each data.quickLinks as link (link.label)}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- validated absolute external URL -->
          <a href={link.href} target="_blank" rel="noreferrer"
            >{link.label}<span aria-hidden="true">↗</span></a
          >
        {/each}
      </nav>
    {/if}
  </footer>
</main>
