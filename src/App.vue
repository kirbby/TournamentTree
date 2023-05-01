<template>
  <div class="container mx-auto my-4">
    <h1 class="text-3xl font-bold mb-4">Tournament Tree App</h1>
    <InputField v-model="playerCount" />
    <Button @click="startTournament">Start Tournament</Button>
    <TournamentTree v-if="isTournamentStarted" :player-count="playerCount" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import InputField from './components/InputField.vue'
import Button from './components/Button.vue'
import TournamentTree from './components/TournamentTree.vue'

const playerCount = ref(8)
const isTournamentStarted = ref(false)

function startTournament() {
  isTournamentStarted.value = true
}
</script>
