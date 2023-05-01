<template>
    <div class="flex items-center mb-2">
      <div class="w-1/3">{{ player1.name }}</div>
      <div class="w-1/3 text-center">{{ winnerText }}</div>
      <div class="w-1/3">{{ player2.name }}</div>
    </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { Player } from '@/types'
  
  const player1 = {
    id: 1,
    name: 'Player 1',
  } as Player
  
  const player2 = {
    id: 2,
    name: 'Player 2',
  } as Player
  
  const winner = computed(() => {
    if (player1.score > player2.score) {
      return player1
    } else if (player2.score > player1.score) {
      return player2
    } else {
      return null
    }
  })
  
  const loser = computed(() => {
    if (player1.score < player2.score) {
      return player1
    } else if (player2.score < player1.score) {
      return player2
    } else {
      return null
    }
  })
  
  const winnerText = computed(() => {
    if (winner.value) {
      return `Winner: ${winner.value.name}`
    } else {
      return 'Tie'
    }
  })
  

    player1.id = props.player1.id
    player1.name = props.player1.name
    player1.score = props.player1.score || 0

    player2.id = props.player2.id
    player2.name = props.player2.name
    player2.score = props.player2.score || 0

</script>
