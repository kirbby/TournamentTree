# Vue Tournament Tree App

This is a Vue.js app for displaying a tournament tree with double elimination and variable player count. The app is built using Vue 3 Composition API and Tailwind CSS.

## Features

- Display a tournament tree with double elimination
- Variable player count (up to 64 players)
- Responsive design using Tailwind CSS

## Project setup

To run the app locally, follow these steps:

1. Clone the repository
2. Install the dependencies with `npm install`
3. Start the development server with `npm run serve`

The app should now be running at `http://localhost:8080/`.

## Components

The app is built using the following components:

- `App.vue`: The main component that renders the tournament tree and controls the state of the app.
- `Matchup.vue`: A component for displaying a single matchup between two players.
- `Round.vue`: A component for displaying a single round of matchups.
- `Bracket.vue`: A component for displaying a single bracket of matchups.
- `BracketContainer.vue`: A component for displaying a container of all the brackets in a single round.
- `TournamentTree.vue`: A component for displaying the full tournament tree for all rounds of the tournament.
- `Button.vue`: A reusable button component for the app.

## Props

The components use the following props:

- `Matchup.vue`: `player1` and `player2` objects representing the two players in the matchup.
- `Round.vue`: `round` object representing a single round of matchups.
- `Bracket.vue`: `matchup1` and `matchup2` objects representing the two matchups in the bracket.
- `BracketContainer.vue`: `round` object representing a single round of matchups.
- `TournamentTree.vue`: `playerCount` number representing the number of players in the tournament.
- `Button.vue`: `text` string representing the text content of the button.

## Events

The components emit the following events:

- `Button.vue`: `click` event emitted when the button is clicked.

## Customization

You can customize the app by modifying the following:

- `src/components/Button.vue`: Modify the styling of the button using Tailwind CSS classes.
- `src/components/TournamentTree.vue`: Modify the player count and the player data in the `rounds` computed property to change the number of players and the matchups in the tournament.

## Conclusion

That's it! With this Vue tournament tree app, you can easily display a double elimination tournament tree with variable player count using the Composition API and Tailwind CSS. Feel free to modify the app and use it in your own projects.
