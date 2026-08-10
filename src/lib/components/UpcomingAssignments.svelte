<script lang="ts">
  import type { DashboardData } from '$lib/models';
  import { SvelteDate } from 'svelte/reactivity';
  import PanelEmptyState from './PanelEmptyState.svelte';

  let {
    assignments,
    generatedAt
  }: { assignments: DashboardData['upcomingAssignments']; generatedAt: string } = $props();
  type WindowFilter = 'today' | 'tomorrow' | 'week';
  let windowFilter: WindowFilter = $state('week');

  const visibleAssignments = $derived.by(() => {
    if (windowFilter === 'week') return assignments;
    const now = new SvelteDate(generatedAt);
    const phoenixDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Phoenix',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const target = new SvelteDate(now);
    if (windowFilter === 'tomorrow') target.setDate(target.getDate() + 1);
    const targetKey = phoenixDate.format(target);
    return assignments.filter(
      (assignment) =>
        assignment.dueAt && phoenixDate.format(new Date(assignment.dueAt)) === targetKey
    );
  });

  const emptyWindowLabel = $derived.by(() => {
    if (windowFilter === 'today') return 'today';
    if (windowFilter === 'tomorrow') return 'tomorrow';
    return 'in this window';
  });

  function dueLabel(iso: string): string {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Phoenix'
    }).format(new Date(iso));
  }
</script>

<section class="panel upcoming-panel" aria-labelledby="upcoming-heading">
  <header class="panel-heading">
    <div>
      <span class="section-kicker">Next 7 days</span>
      <h2 id="upcoming-heading">Upcoming assignments</h2>
    </div>
    <div class="filter-pills" aria-label="Assignment window">
      {#each [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'Next 7 days']] as filter (filter[0])}
        <button
          type="button"
          class:selected={windowFilter === filter[0]}
          aria-pressed={windowFilter === filter[0]}
          onclick={() => (windowFilter = filter[0] as WindowFilter)}>{filter[1]}</button
        >
      {/each}
    </div>
  </header>

  {#if visibleAssignments.length > 0}
    <div class="upcoming-table" role="table" aria-label="Upcoming assignments">
      {#each visibleAssignments as assignment (assignment.id)}
        <!-- Provider deep links are validated external URLs, not SvelteKit routes. -->
        <!-- eslint-disable svelte/no-navigation-without-resolve -->
        <a
          href={assignment.externalUrl}
          target="_blank"
          rel="noreferrer"
          class="upcoming-row"
          role="row"
        >
          <span class="course-chip">{assignment.course.shortName ?? assignment.course.name}</span>
          <span class="upcoming-title">
            <strong>{assignment.title}</strong>
            <small>{dueLabel(assignment.dueAt ?? '')}</small>
          </span>
          <span class="points">{assignment.pointsPossible ?? '—'} pts</span>
          <span
            class:submitted={assignment.reconciliation.state === 'awaiting_grade'}
            class:complete={assignment.reconciliation.state === 'complete'}
            class:attention={assignment.reconciliation.state === 'missing' ||
              assignment.reconciliation.state === 'possible_mismatch'}
            class="submission-state"
          >
            {assignment.reconciliation.label}
          </span>
          <span class="deep-link" aria-hidden="true">↗</span>
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {/each}
    </div>
  {:else}
    <PanelEmptyState
      title={assignments.length > 0 ? `Nothing due ${emptyWindowLabel}` : 'No upcoming assignments'}
      detail={assignments.length > 0
        ? 'Try another time window to see more work.'
        : 'You are clear for the next seven days.'}
    />
  {/if}
</section>
