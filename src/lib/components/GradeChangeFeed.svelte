<script lang="ts">
  import type { Course, GradeChange, GradeChangeValue } from '$lib/models';
  import PanelEmptyState from './PanelEmptyState.svelte';

  let {
    changes,
    courses,
    generatedAt
  }: { changes: GradeChange[]; courses: Course[]; generatedAt: string } = $props();

  const coursesById = $derived(new Map(courses.map((course) => [course.id, course] as const)));

  function titleFor(change: GradeChange): string {
    if (change.type === 'course_grade_changed') return 'Course grade changed';
    if (change.type === 'assignment_graded') return `${change.assignmentTitle} graded`;
    if (change.type === 'assignment_score_changed') return `${change.assignmentTitle} corrected`;
    return change.currentValue === true
      ? `${change.assignmentTitle} marked missing`
      : `${change.assignmentTitle} resolved`;
  }

  function valueLabel(value: GradeChangeValue | undefined, isCourseGrade = false): string {
    if (value === undefined || value === null) return 'Ungraded';
    if (typeof value === 'boolean') return value ? 'Missing' : 'Resolved';
    if (isCourseGrade && typeof value === 'number') return `${value.toFixed(1)}%`;
    return String(value);
  }

  function detailFor(change: GradeChange): string {
    if (change.type === 'missing_status_changed') {
      return change.currentValue === true
        ? 'Needs attention in the gradebook'
        : 'No longer marked missing';
    }
    const courseGrade = change.type === 'course_grade_changed';
    return `${valueLabel(change.previousValue, courseGrade)} → ${valueLabel(change.currentValue, courseGrade)}`;
  }

  function badgeFor(change: GradeChange): { label: string; tone: string } {
    if (change.type === 'course_grade_changed') {
      const movement = Number(change.currentValue) - Number(change.previousValue);
      return {
        label: movement >= 0 ? `↑ ${movement.toFixed(1)}` : `↓ ${Math.abs(movement).toFixed(1)}`,
        tone: movement >= 0 ? 'up' : 'down'
      };
    }
    if (change.type === 'assignment_graded') return { label: 'New grade', tone: 'new' };
    if (change.type === 'assignment_score_changed') return { label: 'Updated', tone: 'updated' };
    return change.currentValue === true
      ? { label: 'Missing', tone: 'missing' }
      : { label: 'Resolved', tone: 'resolved' };
  }

  function relativeTime(iso: string): string {
    const minutes = Math.max(
      0,
      Math.round((new Date(generatedAt).getTime() - new Date(iso).getTime()) / 60_000)
    );
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }
</script>

<section class="panel grade-feed-panel" aria-labelledby="grade-changes-heading">
  <header class="panel-heading">
    <div>
      <span class="section-kicker">Recently graded & changed</span>
      <h2 id="grade-changes-heading">Grade activity</h2>
    </div>
    <span class="panel-count">{changes.length} events</span>
  </header>

  {#if changes.length > 0}
    <ul class="grade-feed">
      {#each changes.slice(0, 5) as change (change.id)}
        {@const badge = badgeFor(change)}
        <li>
          <div class="feed-topline">
            <span class="course-label"
              >{coursesById.get(change.courseId)?.shortName ??
                coursesById.get(change.courseId)?.name}</span
            >
            <span
              class:up={badge.tone === 'up'}
              class:down={badge.tone === 'down'}
              class:missing={badge.tone === 'missing'}
              class="change-badge">{badge.label}</span
            >
          </div>
          <strong>{titleFor(change)}</strong>
          <div class="feed-detail">
            <span>{detailFor(change)}</span><time>{relativeTime(change.detectedAt)}</time>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <PanelEmptyState
      title="No recent grade changes"
      detail="New scores and gradebook updates will collect here."
    />
  {/if}
</section>
