<template>
    <div class="flex flex-col items-center">
      <div class="border border-gray-400 w-48 h-32 flex flex-col justify-center items-center">
        <div class="text-xl font-bold">{{ matchup1.player1.name }}</div>
        <div class="text-lg">{{ matchup1.player1.score }}</div>
        <div class="text-lg">{{ matchup1.player2.score }}</div>
        <div class="text-xl font-bold">{{ matchup1.player2.name }}</div>
      </div>
      <div class="h-4 w-4 bg-gray-400 rounded-full my-1"></div>
      <div class="border border-gray-400 w-48 h-32 flex flex-col justify-center items-center">
        <div class="text-xl font-bold">{{ matchup2.player1.name }}</div>
        <div class="text-lg">{{ matchup2.player1.score }}</div>
        <div class="text-lg">{{ matchup2.player2.score }}</div>
        <div class="text-xl font-bold">{{ matchup2.player2.name }}</div>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { computed } from 'vue'
  import { Matchup } from '@/types'
  
  export default {
    props: {
      matchup1: {
        type: Object as () => Matchup,
        required: true,
      },
      matchup2: {
        type: Object as () => Matchup,
        required: true,
      },
    },
  }
  </script>
  