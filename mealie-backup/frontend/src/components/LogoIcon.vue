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
      <!-- Subtle top-to-bottom sheen on the green background -->
      <linearGradient id="bg-sheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="white" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.08"/>
      </linearGradient>
    </defs>

    <!-- Background -->
    <rect width="44" height="44" rx="10" fill="#166534"/>
    <rect width="44" height="44" rx="10" fill="url(#bg-sheen)"/>
    <!-- Thin inner highlight for depth -->
    <rect x="0.75" y="0.75" width="42.5" height="42.5" rx="9.5" stroke="white" stroke-opacity="0.12" stroke-width="1"/>

    <!-- ── Fork (Mealie) ───────────────────────────────────────────── -->
    <!-- Three tines -->
    <line x1="11" y1="6"  x2="11" y2="18" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="15" y1="6"  x2="15" y2="18" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="19" y1="6"  x2="19" y2="18" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Shoulder: tines converge into handle -->
    <path d="M11 18 Q15 24.5 19 18" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    <!-- Handle -->
    <line x1="15" y1="24.5" x2="15" y2="38" stroke="white" stroke-width="2.5" stroke-linecap="round"/>

    <!-- ── Floppy disk (backup) ────────────────────────────────────── -->
    <!-- Disk body (white) -->
    <rect x="23.5" y="23.5" width="16.5" height="16.5" rx="2.5" fill="white"/>
    <!-- Shutter label area tint (top portion slightly off-white) -->
    <rect x="23.5" y="23.5" width="16.5" height="8.5"  rx="2.5" fill="#e2f5e9"/>
    <!-- Metal slide tab on shutter -->
    <rect x="27.5" y="24.5" width="3.5"  height="7"    rx="0.75" fill="#166534" opacity="0.75"/>
    <!-- Access window at bottom -->
    <rect x="25.5" y="34"   width="12.5" height="4.5"  rx="1"    fill="#166534" opacity="0.65"/>
  </svg>
</template>
