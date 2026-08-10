<script lang="ts">
  import type { RankedAssignment } from '$lib/models';
  import PanelEmptyState from './PanelEmptyState.svelte';

  let { assignments }: { assignments: RankedAssignment[] } = $props();

  function dueLabel(dueAt: string | null): string {
    if (!dueAt) return 'No due date';
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Phoenix'
    }).format(new Date(dueAt));
  }
</script>

<section class="panel priority-panel" aria-labelledby="what-matters-heading">
  <header class="panel-heading">
    <div>
      <span class="section-kicker">Ranked for you</span>
      <h2 id="what-matters-heading">What matters</h2>
    </div>
    <span class="panel-count">{assignments.length} items</span>
  </header>

  {#if assignments.length > 0}
    <ol class="priority-list">
      {#each assignments as item, index (item.assignment.id)}
        <li>
          <span class="rank">{String(index + 1).padStart(2, '0')}</span>
          <div class="priority-main">
            <div class="assignment-heading">
              <!-- Provider deep links are validated external URLs, not SvelteKit routes. -->
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
              <a href={item.assignment.externalUrl} target="_blank" rel="noreferrer">
                {item.assignment.title}
              </a>
              <span>{item.course.shortName ?? item.course.name}</span>
            </div>
            <p>{item.explanation}</p>
            <div class="assignment-meta">
              <span>{dueLabel(item.assignment.dueAt)}</span>
              {#if item.assignment.pointsPossible}
                <span>{item.assignment.pointsPossible} pts</span>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ol>
  {:else}
    <PanelEmptyState
      title="Nothing urgent right now"
      detail="New work will appear here when it needs your attention."
    />
  {/if}
</section>
