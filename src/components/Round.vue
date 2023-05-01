<template>
    <div class="mb-4">
      <h2 class="text-xl font-bold mb-2">Round {{ round.roundNumber }}</h2>
      <Matchup v-for="(matchup, index) in round.matchups" :key="index" :player1="matchup.player1" :player2="matchup.player2" />
    </div>
  </template>
  
  <script setup lang="ts">
  import Matchup from './Matchup.vue'
  import { Round } from '@/types'
  
  export default {
    components: {
      Matchup,
    },
    props: {
      round: {
        type: Object as () => Round,
        required: true,
      },
    },
  }
  </script>
  