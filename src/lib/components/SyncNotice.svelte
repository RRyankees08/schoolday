<script lang="ts">
  import type { ProviderSyncStatus } from '$lib/models';

  let { generatedAt, syncStatus }: { generatedAt: string; syncStatus: ProviderSyncStatus[] } =
    $props();

  const providerName = {
    canvas: 'Canvas',
    studentVue: 'StudentVUE',
    bellLogic: 'Bell-Logic'
  } as const;

  const notices = $derived(
    syncStatus.flatMap((status) => {
      if (status.status === 'error') return [{ ...status, reason: status.label }];
      if (status.status !== 'live') return [];
      const age = new Date(generatedAt).getTime() - new Date(status.lastUpdatedAt).getTime();
      return age > 6 * 60 * 60 * 1000
        ? [{ ...status, reason: `${providerName[status.provider]} may be out of date` }]
        : [];
    })
  );

  function updatedLabel(iso: string): string {
    const minutes = Math.max(
      0,
      Math.round((new Date(generatedAt).getTime() - new Date(iso).getTime()) / 60_000)
    );
    if (minutes < 2) return 'updated just now';
    if (minutes < 60) return `updated ${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    return `updated ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
</script>

{#if notices.length > 0}
  <aside class="sync-notice" aria-labelledby="sync-notice-title">
    <div>
      <strong id="sync-notice-title">Some information needs a quick check</strong>
      <p>The rest of your dashboard is still available.</p>
    </div>
    <ul>
      {#each notices as notice (notice.provider)}
        <li>
          <strong>{providerName[notice.provider]}</strong>
          <span>{notice.reason} · {updatedLabel(notice.lastUpdatedAt)}</span>
        </li>
      {/each}
    </ul>
  </aside>
{/if}
