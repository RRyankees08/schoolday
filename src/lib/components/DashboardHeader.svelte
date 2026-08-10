<script lang="ts">
  import type { DashboardData, ProviderSyncStatus, SchoolDay } from '$lib/models';

  let {
    displayName,
    generatedAt,
    schoolDay,
    syncStatus,
    onRefreshed
  }: {
    displayName: string;
    generatedAt: string;
    schoolDay: SchoolDay;
    syncStatus: ProviderSyncStatus[];
    onRefreshed: (dashboard: DashboardData) => void;
  } = $props();

  const dateLabel = $derived(
    new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Phoenix'
    }).format(new Date(generatedAt))
  );

  const greeting = $derived.by(() => {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        hourCycle: 'h23',
        timeZone: 'America/Phoenix'
      }).format(new Date(generatedAt))
    );
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  });

  const dayContext = $derived(
    schoolDay.dayType ? `${schoolDay.dayType} Day` : schoolDay.scheduleName
  );
  const dateContext = $derived(dayContext ? `${dateLabel} · ${dayContext}` : dateLabel);

  function freshnessLabel(statuses: ProviderSyncStatus[]): string {
    const ages = statuses
      .filter((status) => status.status === 'live')
      .map((status) => new Date(generatedAt).getTime() - new Date(status.lastUpdatedAt).getTime())
      .filter((age) => Number.isFinite(age) && age >= 0);
    if (ages.length === 0) return '';
    const minutes = Math.floor(Math.max(...ages) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }

  const statusLabel = $derived.by(() => {
    if (syncStatus.some((status) => status.status === 'error')) return 'Live data · degraded';
    const live = syncStatus.filter((status) => status.status === 'live');
    if (live.length === 0) return 'Fixture preview';
    const freshness = freshnessLabel(syncStatus);
    if (live.length === syncStatus.length) return `All sources · ${freshness}`;
    return `${live.map((status) => status.label.replace(/ (live|cached)$/, '')).join(' + ')} · ${freshness}`;
  });

  const statusTone = $derived(
    syncStatus.some((status) => status.status === 'error') ? 'error' : 'healthy'
  );

  let refreshing = $state(false);
  let refreshFailed = $state(false);

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    refreshFailed = false;
    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      if (!response.ok) throw new Error('Refresh failed');
      onRefreshed((await response.json()) as DashboardData);
    } catch {
      refreshFailed = true;
    } finally {
      refreshing = false;
    }
  }
</script>

<header class="dashboard-header">
  <div class="brand-lockup" aria-label="SchoolDay">
    <span class="brand-mark" aria-hidden="true"><span></span></span>
    <span class="brand-name">SchoolDay</span>
  </div>

  <div class="day-intro">
    <p>{greeting}, {displayName}</p>
    <span>{dateContext}</span>
  </div>

  <div class="header-actions">
    <div
      class="fixture-status"
      class:error={statusTone === 'error' || refreshFailed}
      title={refreshFailed
        ? 'Could not refresh'
        : syncStatus.map((status) => status.label).join(', ')}
    >
      <span class="status-dot"></span>
      {refreshFailed ? 'Refresh failed' : statusLabel}
    </div>
    <button class="sync-button" type="button" onclick={refresh} disabled={refreshing}>
      {refreshing ? 'Syncing…' : 'Sync now'}
    </button>
  </div>
</header>
