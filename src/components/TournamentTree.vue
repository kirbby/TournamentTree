<template>
    <div class="flex justify-center">
      <div class="w-96">
        <Bracket v-for="round in rounds" :key="round.roundNumber" :round="round" />
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, computed } from 'vue'
  import { Round } from '@/types'
  import Bracket from './Bracket.vue'
  
  const playerCount = ref(8)
  
  const rounds = computed(() => {
    const totalRounds = Math.ceil(Math.log2(playerCount.value))
    const matchesPerRound = playerCount.value / 2
    const initialMatches = Array.from({ length: matchesPerRound }, () => ({ winner: null, loser: null }))
    const rounds = []
  
    for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber++) {
      const round: Round = {
        roundNumber,
        matchups: [...initialMatches],
      }
  
      rounds.push(round)
    }
  
    return rounds
  })  

      playerCount.value = props.playerCount
  </script>
  