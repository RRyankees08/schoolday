<script lang="ts">
  import type { ScheduleState, SchoolDay } from '$lib/models';
  import PanelEmptyState from './PanelEmptyState.svelte';

  let { schoolDay, state }: { schoolDay: SchoolDay; state: ScheduleState } = $props();

  function timeLabel(iso: string): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Phoenix'
    }).format(new Date(iso));
  }
</script>

<section class="panel schedule-panel" aria-labelledby="schedule-heading">
  <header class="panel-heading">
    <div>
      <span class="section-kicker">{schoolDay.scheduleName}</span>
      <h2 id="schedule-heading">Daily schedule</h2>
    </div>
    <span class="day-pill">{schoolDay.dayType} day</span>
  </header>

  {#if state.periodStates.length > 0}
    <ol class="schedule-list">
      {#each state.periodStates as item (item.period.id)}
        <li class:completed={item.state === 'completed'} class:current={item.state === 'current'}>
          <span class="schedule-marker" aria-hidden="true"></span>
          <div>
            <strong>{item.period.name}</strong>
            <span>{timeLabel(item.period.startAt)}–{timeLabel(item.period.endAt)}</span>
          </div>
          <span class="period-state">{item.state}</span>
        </li>
      {/each}
    </ol>
  {:else}
    <PanelEmptyState
      title={schoolDay.isSchoolDay ? 'Schedule unavailable' : 'No classes today'}
      detail={schoolDay.isSchoolDay
        ? 'Bell timing will return after the schedule source reconnects.'
        : 'Your next school-day schedule will appear here automatically.'}
    />
  {/if}
</section>
