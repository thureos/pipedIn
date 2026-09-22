<script setup>
import { Star, Check, X } from 'lucide-vue-next'
import { cardColors } from './data.js'
defineProps({ color: { type: String, default: '' }, starred: Boolean, company: { type: String, default: 'application' } })
defineEmits(['change'])
</script>

<template>
  <div class="card-preferences" @click.stop @pointerdown.stop @dragstart.prevent.stop>
    <div class="card-colors" role="group" :aria-label="`Card color for ${company}`">
      <button v-for="option in cardColors" :key="option" type="button" class="color-swatch" :data-color="option" :aria-label="`Set ${company} card color to ${option}`" :title="option" :aria-pressed="color === option" @click="$emit('change', { color: option })"><Check v-if="color === option" :size="14" /></button>
      <button type="button" class="color-reset icon-button" :aria-label="`Clear ${company} card color`" title="Clear card color" :disabled="!color" @click="$emit('change', { color: '' })"><X :size="14" /></button>
    </div>
    <button type="button" class="star-toggle icon-button" :class="{ 'is-starred': starred }" :aria-label="`${starred ? 'Unstar' : 'Star'} ${company}`" :aria-pressed="starred" :title="starred ? 'Unstar application' : 'Star application'" @click="$emit('change', { starred: !starred })"><Star :size="18" /></button>
  </div>
</template>
