# Rikiki against the AI

Play **Rikiki**, the Belgian trick-taking card game (a version of "Oh Hell"), against three AI players
that taught themselves the game through self-play reinforcement learning.

**Play:** https://deepneurals.github.io/rikiki-ai/

Everything runs in your browser: the game engine (`rikiki_core.js`) and the neural network's weights
(`weights_f16.txt`, about 1.5 million parameters stored at half precision). Nothing is sent to a server.

## Rules in short

* Each round everyone gets the same number of cards (1, 2, … up to the maximum and back down).
  The next card is turned up: its suit is trump. With the whole deck dealt there is no trump.
* Everyone bids how many tricks they will take. The dealer bids last and may not make the bids add up
  to the number of tricks.
* Follow suit if you can. Highest trump wins, otherwise the highest card of the led suit.
* Exact bid: 5 points + 3 per trick. Wrong: −2 per trick off.

## About the AI

Two neural networks (bidding and card play) were trained with Deep Monte-Carlo self-play for 2 million
rounds. They predict the points each possible move will score this round. Against three hand-written
heuristic bots, the AI wins about 54% of 4-player games.
Switch on **Coach** in the game to see its estimates for your own moves.
