<template>
    <div class="flex flex-col items-center">
      <Bracket v-for="(matchup, index) in round.matchups" :key="index" :matchup1="matchup.player1Matchup" :matchup2="matchup.player2Matchup" />
    </div>
  </template>
  
  <script setup lang="ts">
  import Bracket from './Bracket.vue'
  import { Round } from '@/types'
  
  export default {
    components: {
      Bracket,
    },
    props: {
      round: {
        type: Object as () => Round,
        required: true,
      },
    },
  }
  </script>
  