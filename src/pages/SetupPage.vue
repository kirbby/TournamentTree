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
</div>
</template>

<script setup lang="ts">
import { ref } from "vue";

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
</script>

<style scoped lang="postcss"></style>
