<script lang="ts">
  let { title, detail }: { title: string; detail: string } = $props();
</script>

<div class="panel-empty-state" role="status">
  <span class="empty-state-mark" aria-hidden="true">✓</span>
  <div>
    <strong>{title}</strong>
    <p>{detail}</p>
  </div>
</div>
