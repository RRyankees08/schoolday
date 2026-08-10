<script lang="ts">
  import type { CourseGradeSummary } from '$lib/models';
  import PanelEmptyState from './PanelEmptyState.svelte';

  let { grades }: { grades: CourseGradeSummary[] } = $props();

  function movementLabel(movement: number): string {
    return `${movement > 0 ? '↑' : '↓'} ${Math.abs(movement).toFixed(1)}`;
  }

  function gradeLabel(grade: CourseGradeSummary): string {
    if (grade.percentage !== undefined) return `${grade.percentage.toFixed(1)}%`;
    return grade.rawDisplay ?? grade.letterGrade ?? '—';
  }
</script>

<section class="panel grades-panel" aria-labelledby="grades-heading">
  <header class="panel-heading">
    <div>
      <span class="section-kicker">{grades[0]?.gradingPeriod ?? 'Current period'}</span>
      <h2 id="grades-heading">Grades</h2>
    </div>
  </header>

  {#if grades.length > 0}
    <ul class="grade-list">
      {#each grades as grade (grade.courseId)}
        <li>
          <div>
            <strong>{grade.course.shortName ?? grade.course.name}</strong>
            <span>{grade.course.teacher}</span>
          </div>
          <div class="grade-number">
            <strong>{gradeLabel(grade)}</strong>
            {#if grade.movement !== undefined}
              <span class:positive={grade.movement > 0} class:negative={grade.movement < 0}>
                {movementLabel(grade.movement)}
              </span>
            {:else}
              <span class="steady">—</span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <PanelEmptyState
      title="Grades are not available yet"
      detail="SchoolDay will show official grades after the next successful sync."
    />
  {/if}
</section>
