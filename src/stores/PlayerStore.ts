import { defineStore } from "pinia";
import Player from "@/types/Player";


export const usePlayerStore = defineStore("player", {
    state: () => ({
        players: [] as Player[],
    }),
    getters: {
        getPlayers(state): Player[] {
            return state.players;
        },
        getPlayerById(state): (id: number) => (Player | undefined) {
            return id => state.players.find(player => player.id === id);
        }
    },
    actions: {
        addPlayer(player: Player) {
            this.players.push(player);
        },
        deletePlayer(player: Player) {
            this.players.splice(this.players.indexOf(player), 1);
        },
    },
    persist: true,
});
