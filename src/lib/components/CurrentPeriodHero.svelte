<script lang="ts">
  import { onMount } from 'svelte';
  import type { ScheduleState, SchoolDay } from '$lib/models';

  let {
    schoolDay,
    initialState
  }: {
    schoolDay: SchoolDay;
    initialState: ScheduleState;
  } = $props();

  let elapsedSeconds = $state(0);
  const current = $derived(initialState.currentPeriod);
  const next = $derived(initialState.nextPeriod);
  const initialRemaining = $derived(current?.secondsRemaining ?? 0);
  const periodDuration = $derived(
    current
      ? Math.max(
          1,
          (new Date(current.period.endAt).getTime() - new Date(current.period.startAt).getTime()) /
            1000
        )
      : 1
  );

  const remaining = $derived(Math.max(0, initialRemaining - elapsedSeconds));
  const progress = $derived(
    current ? Math.min(100, current.progressPercent + (elapsedSeconds / periodDuration) * 100) : 0
  );
  const untilNext = $derived(
    initialState.secondsUntilNext === null
      ? null
      : Math.max(0, initialState.secondsUntilNext - elapsedSeconds)
  );

  onMount(() => {
    const timer = window.setInterval(() => {
      elapsedSeconds += 1;
    }, 1000);
    return () => window.clearInterval(timer);
  });

  function timeLabel(iso: string): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Phoenix'
    }).format(new Date(iso));
  }

  function durationLabel(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  }
</script>

<section class="current-hero" aria-labelledby="current-period-title">
  {#if current}
    <div class="current-copy">
      <div class="section-kicker live-kicker"><span></span> Current class</div>
      <h1 id="current-period-title">{current.period.name}</h1>
      <p>{timeLabel(current.period.startAt)}–{timeLabel(current.period.endAt)}</p>
    </div>

    <div class="countdown" aria-live="polite">
      <strong>{durationLabel(remaining)}</strong>
      <span>remaining</span>
    </div>

    <div class="next-period">
      <span class="section-kicker">Up next</span>
      {#if next}
        <strong>{next.period.name}</strong>
        <p>
          {timeLabel(next.period.startAt)}
          {#if untilNext !== null}<span>· in {Math.ceil(untilNext / 60)} min</span>{/if}
        </p>
      {:else}
        <strong>School day complete</strong>
      {/if}
    </div>

    <div class="time-rail" style={`--period-progress: ${progress}%`}>
      <div class="rail-track"><span></span></div>
      <span class="rail-start">{timeLabel(current.period.startAt)}</span>
      <span class="rail-progress">{Math.round(progress)}% through period</span>
      <span class="rail-end">{timeLabel(current.period.endAt)}</span>
    </div>
  {:else}
    <div class="current-copy off-session">
      <div class="section-kicker">Today</div>
      {#if !schoolDay.isSchoolDay || initialState.phase === 'no_school'}
        <h1 id="current-period-title">No school today</h1>
      {:else if initialState.phase === 'before_school' && next}
        <h1 id="current-period-title">
          School starts in {Math.ceil((untilNext ?? 0) / 60)} minutes
        </h1>
        <p>First up: {next.period.name} at {timeLabel(next.period.startAt)}</p>
      {:else if initialState.phase === 'passing_period' && next}
        <h1 id="current-period-title">Passing period</h1>
        <p>{next.period.name} starts in {Math.ceil((untilNext ?? 0) / 60)} minutes</p>
      {:else}
        <h1 id="current-period-title">School day complete</h1>
      {/if}
    </div>
  {/if}
</section>
