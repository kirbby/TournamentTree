<template>
<div class="flex h-screen w-screen flex-col items-center space-y-4 p-10 text-xl">
    <h1 class="text-4xl font-bold">
        Players
    </h1>
    <form
        class="flex w-full flex-row justify-center space-x-2"
        @submit="addPlayer"
    >
        <input
            ref="playerNameInput"
            v-model="playerName"
            type="text"
            name=""
            placeholder="Name"
            class="flex-1 rounded-md border-2 border-gray-300 p-2"
        >
        <button class="flex flex-1 items-center justify-center rounded bg-blue-500 p-3">
            <i-mdi-plus class="text-white" />
        </button>
    </form>
    <div class="h-full w-full overflow-y-auto">
        <ul class="flex h-full w-full flex-col divide-y divide-solid">
            <li
                v-for="(player, index) in players"
                :key="player"
                class="flex flex-row items-center justify-between px-2"
            >
                <div>{{ player }}</div>
                <button
                    type="button"
                    class="rounded p-2 hover:bg-gray-200"
                    @click="deletePlayer(index)"
                >
                    <i-mdi-close />
                </button>
            </li>
        </ul>
    </div>
    <div class="flex flex-row">
        <router-link
            v-if="isTournamentStarted"
            to="/tournament"
            class="flex items-center justify-center rounded bg-blue-500 p-3 text-white"
        >
            To Tournament
        </router-link>
        <button
            v-else
            type="button"
            class="flex items-center justify-center rounded bg-blue-500 p-3 text-white"
            title="Stop Tournament"
            @click="stopTournament"
        >
            Stop
        </button>
        <button
            type="button"
            class="flex items-center justify-center rounded bg-blue-500 p-3 text-white"
            @click="startTournament"
        >
            Start Tournament
        </button>
    </div>
</div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useTournamentStore } from "@/stores/TournamentStore";

const { isTournamentStarted, startTournament: startTournamentStore, stopTournament: stopTournamentStore } = useTournamentStore();
const players = ref<string[]>([]);
const playerName = ref("");
const playerNameInput = ref<HTMLInputElement | null>(null);

function addPlayer(event: Event) {
    event.preventDefault();

    console.log(playerName.value);
    players.value.push(playerName.value);

    playerName.value = "";
    playerNameInput.value?.focus();
}

function deletePlayer(index: number) {
    players.value.splice(index, 1);
}

function startTournament() {
    startTournamentStore();
    useRouter().push("/tournament");
}

function stopTournament() {
    if (window.confirm("Are you sure you want to stop the tournament?")) {
        stopTournamentStore();
    }
}
</script>

<style scoped lang="postcss"></style>
