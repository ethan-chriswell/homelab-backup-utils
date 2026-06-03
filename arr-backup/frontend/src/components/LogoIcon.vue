<script setup>
defineProps({
  size: { type: [Number, String], default: 36 },
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 44 44"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <!-- Subtle top-to-bottom sheen on the violet background -->
      <linearGradient id="bg-sheen-arr" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="white" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.08"/>
      </linearGradient>
    </defs>

    <!-- Background -->
    <rect width="44" height="44" rx="10" fill="#6d28d9"/>
    <rect width="44" height="44" rx="10" fill="url(#bg-sheen-arr)"/>
    <!-- Thin inner highlight for depth -->
    <rect x="0.75" y="0.75" width="42.5" height="42.5" rx="9.5" stroke="white" stroke-opacity="0.12" stroke-width="1"/>

    <!-- ── Satellite dish / antenna ──────────────────────────────────── -->
    <!-- Dish bowl (arc) -->
    <path d="M8 30 Q14 14 30 16" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    <!-- Dish arm -->
    <line x1="8" y1="30" x2="19" y2="19" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Signal waves emanating from dish focal point -->
    <path d="M21 17 Q25 12 30 16" stroke="white" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.9"/>
    <path d="M23 13 Q29 7 36 12" stroke="white" stroke-width="1.75" stroke-linecap="round" fill="none" opacity="0.65"/>
    <!-- Dish stand / base -->
    <line x1="18" y1="30" x2="26" y2="30" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="22" y1="26" x2="22" y2="30" stroke="white" stroke-width="2.5" stroke-linecap="round"/>

    <!-- ── Floppy disk (backup) ────────────────────────────────────── -->
    <!-- Disk body (white) -->
    <rect x="27" y="26" width="13" height="13" rx="2" fill="white"/>
    <!-- Label area -->
    <rect x="27" y="26" width="13" height="6.5" rx="2" fill="#ede9fe"/>
    <!-- Metal slide tab -->
    <rect x="30.5" y="27" width="3" height="5.5" rx="0.75" fill="#6d28d9" opacity="0.75"/>
    <!-- Access window at bottom -->
    <rect x="28.5" y="33.5" width="10" height="4" rx="0.75" fill="#6d28d9" opacity="0.65"/>
  </svg>
</template>
