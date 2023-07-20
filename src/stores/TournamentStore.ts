import { defineStore } from "pinia";


export const useTournamentStore = defineStore("tournament", {
    state: () => ({
        isTournamentStarted: false,
    }),
    getters: {
        getIsTournamentStarted(state): boolean {
            return state.isTournamentStarted;
        }
    },
    actions: {
        startTournament() {
            this.isTournamentStarted = true;
        },
        stopTournament() {
            this.isTournamentStarted = false;
        }
    },
    persist: true,
});
