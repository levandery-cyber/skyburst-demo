# Skyburst

**Live demo:** https://skyburst-khaki.vercel.app

A night-sky crash game built with **Next.js (App Router) and plain JavaScript**. Light the fuse, ride the shell, and cash out before it bursts. The multiplier climbs along a curve and the shell bursts at a random height; if you have not cashed out by then, the bet is lost.

It is a portfolio demo. Credits are virtual, nothing can be bought or withdrawn, and the other players and the chat are simulated.

## What is in it

- Two bets per round with manual cash-out, auto cash-out at a multiplier, rebet, and a queue for the next round when you bet mid-flight.
- A canvas scene: parallax stars, a festival skyline, a burning fuse as the countdown, a sparkling shell, and bursts whose size and colour follow the multiplier. Screen shake, rings and flashes scale with it; `prefers-reduced-motion` tones it all down.
- Colour carries meaning. The metals that colour a real firework colour the burst height: strontium red under 2x, sodium gold up to 10x, copper blue up to 100x, magnesium white above.
- Live bets, your own bet history, a top-wins list, a simulated chat and a "sky shower" promo with claimable credits.
- Provably fair rounds (below) with an in-app verifier.
- Sound synthesised with the Web Audio API (no audio files), off by default.
- Responsive from phone to desktop. Keyboard: `Space` or `1` acts on bet A, `2` on bet B.

## Fairness

```
hash  = HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`)
u     = first 52 bits of hash / 2^52
burst = max(1, floor(97 / (1 - u)) / 100)
```

`P(burst >= x) = 0.97 / x`, so every cash-out target returns 97% on average, and about 4% of rounds burst at 1.00x. The SHA-256 of the server seed is shown before the round and the seed is revealed after it. In this demo the seeds are generated in the browser, so it shows the method rather than a trust guarantee. `npm test` simulates 1.5 million rounds to check the 97%.

## Structure

```
app/          layout, page, styles, icon, social image
components/   Game (root), Stage (canvas + big number), BetPanel, Feed, Chat, modals
lib/engine.js round lifecycle, bets, simulated table (framework-free)
lib/fair.js   HMAC-SHA256 burst height and round verification
lib/sky.js    canvas renderer
lib/audio.js  Web Audio synth
lib/bots.js   simulated players and chat lines
tests/        node:test suites for the maths and the engine
```

The engine runs on an injectable clock and is tested without a browser. React reads it through `useSyncExternalStore`; the canvas and the live multiplier are driven straight from `requestAnimationFrame`, so React does not re-render 60 times a second.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # maths and engine tests
npm run build && npm start
```

Deploy with `npx vercel@latest deploy --prod` (the project is already linked in `.vercel`). There are no environment variables and no backend.
