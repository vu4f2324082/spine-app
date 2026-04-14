<script lang="ts">
  import { goto } from '$app/navigation';
  // /admin is deprecated — redirect to the Doctor Dashboard
  goto('/doctor', { replaceState: true });
</script>
