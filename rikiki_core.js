/* Rikiki engine, state encoder and neural-network player for the browser.
   A line-by-line port of rikiki/engine.py, rikiki/features.py and rikiki/model.py,
   checked against test_vectors.json exported from Python. */
(function (global) {
  "use strict";
  const NUM_CARDS = 52;
  const suitOf = (c) => Math.floor(c / 13);
  const rankOf = (c) => c % 13;

  const DEFAULT_RULES = { numPlayers: 4, exactBase: 5, perTrick: 3, missPerTrick: 2, dealerRestriction: true };

  function roundSizes(maxCards, schedule) {
    const up = []; for (let i = 1; i <= maxCards; i++) up.push(i);
    const down = up.slice().reverse();
    if (schedule === "up-down") return up.concat(down.slice(1));
    if (schedule === "down-up") return down.concat(up.slice(1));
    if (schedule === "up") return up;
    return down;
  }

  function shuffle(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  class Round {
    constructor(rules, nCards, dealer, rnd) {
      this.rules = rules; this.n = rules.numPlayers; this.nCards = nCards; this.dealer = dealer;
      if (rnd) {
        const deck = shuffle([...Array(NUM_CARDS).keys()], rnd);
        this.hands = []; for (let i = 0; i < this.n; i++) this.hands.push(deck.slice(i * nCards, (i + 1) * nCards).sort((a, b) => a - b));
        const dealt = this.n * nCards;
        this.trumpCard = dealt < NUM_CARDS ? deck[dealt] : null;
      } else { this.hands = []; this.trumpCard = null; }
      this.trump = this.trumpCard == null ? null : suitOf(this.trumpCard);
      this.bids = Array(this.n).fill(null); this.tricksWon = Array(this.n).fill(0);
      this.phase = "bid"; this.current = (dealer + 1) % this.n; this.leader = this.current;
      this.trick = []; this.played = []; this.void = [...Array(this.n)].map(() => [false, false, false, false]);
      this.lastTrick = null; this.lastTrickWinner = null; this.trickNo = 0;
    }
    static fromState(rules, s) {
      const r = new Round(rules, s.nCards, s.dealer, null);
      Object.assign(r, { hands: s.hands.map((h) => h.slice()), trumpCard: s.trumpCard, trump: s.trump, bids: s.bids.slice(), tricksWon: s.tricksWon.slice(),
        phase: s.phase, current: s.current, leader: s.leader, trick: s.trick.map((t) => t.slice()), played: s.played.slice(),
        void: s.void.map((v) => v.slice()), trickNo: s.trickNo, lastTrick: s.lastTrick || null, lastTrickWinner: s.lastTrickWinner ?? null });
      return r;
    }
    toState() {
      return { nCards: this.nCards, dealer: this.dealer, hands: this.hands, trumpCard: this.trumpCard, trump: this.trump, bids: this.bids,
        tricksWon: this.tricksWon, phase: this.phase, current: this.current, leader: this.leader, trick: this.trick, played: this.played,
        void: this.void, trickNo: this.trickNo, lastTrick: this.lastTrick, lastTrickWinner: this.lastTrickWinner };
    }
    get leadSuit() { return this.trick.length ? suitOf(this.trick[0][1]) : null; }
    bidOrderPos(p) { return ((p - this.dealer - 1) % this.n + this.n) % this.n; }
    forbiddenBid() {
      if (!this.rules.dealerRestriction || this.phase !== "bid" || this.current !== this.dealer) return null;
      const rest = this.nCards - this.bids.reduce((s, b) => s + (b == null ? 0 : b), 0);
      return rest >= 0 && rest <= this.nCards ? rest : null;
    }
    legalBids() { const f = this.forbiddenBid(); const out = []; for (let b = 0; b <= this.nCards; b++) if (b !== f) out.push(b); return out; }
    legalCards(p = this.current) {
      const hand = this.hands[p], lead = this.leadSuit;
      if (lead != null) { const follow = hand.filter((c) => suitOf(c) === lead); if (follow.length) return follow; }
      return hand.slice();
    }
    winningEntry(trick) {
      let best = trick[0];
      for (let i = 1; i < trick.length; i++) {
        const [p, c] = trick[i], bs = suitOf(best[1]), cs = suitOf(c);
        if (cs === bs) { if (rankOf(c) > rankOf(best[1])) best = [p, c]; }
        else if (this.trump != null && cs === this.trump) best = [p, c];
      }
      return best;
    }
    beats(card, bestCard) {
      const cs = suitOf(card), bs = suitOf(bestCard);
      if (cs === bs) return rankOf(card) > rankOf(bestCard);
      return this.trump != null && cs === this.trump;
    }
    score(p) {
      const b = this.bids[p], w = this.tricksWon[p], R = this.rules;
      return b === w ? R.exactBase + R.perTrick * w : -R.missPerTrick * Math.abs(b - w);
    }
    scores() { return [...Array(this.n).keys()].map((p) => this.score(p)); }
    bid(v) {
      if (this.phase !== "bid") throw new Error("not in bidding phase");
      if (!this.legalBids().includes(v)) throw new Error(`illegal bid ${v}`);
      this.bids[this.current] = v;
      if (this.current === this.dealer) { this.phase = "play"; this.current = this.leader; }
      else this.current = (this.current + 1) % this.n;
    }
    play(card) {
      if (this.phase !== "play") throw new Error("not in playing phase");
      const p = this.current;
      if (!this.legalCards(p).includes(card)) throw new Error("illegal card");
      const lead = this.leadSuit;
      if (lead != null && suitOf(card) !== lead) this.void[p][lead] = true;
      this.hands[p] = this.hands[p].filter((c) => c !== card);
      this.trick.push([p, card]); this.played.push(card);
      if (this.trick.length < this.n) { this.current = (p + 1) % this.n; return null; }
      const winner = this.winningEntry(this.trick)[0];
      this.tricksWon[winner]++;
      this.lastTrick = this.trick; this.lastTrickWinner = winner;
      this.trick = []; this.trickNo++;
      this.leader = this.current = winner;
      if (this.trickNo === this.nCards) this.phase = "done";
      return winner;
    }
  }

  // ------------------------------------------------------------- features (port of features.py)
  const maxBid = (n) => Math.floor(NUM_CARDS / n);
  const featureSize = (n) => 52 + 5 + 52 + 52 + 52 * (n - 1) + 4 + 52 + n + 8 * n + 3 + n + n + 1 + (maxBid(n) + 1);

  function encode(r, player, out) {
    const n = r.n, mb = maxBid(n), x = out || new Float32Array(featureSize(n));
    x.fill(0);
    let o = 0;
    for (const c of r.hands[player]) x[o + c] = 1;
    o += 52;
    x[o + (r.trump == null ? 4 : r.trump)] = 1; o += 5;
    if (r.trumpCard != null) x[o + r.trumpCard] = 1;
    o += 52;
    for (const c of r.played) x[o + c] = 1;
    o += 52;
    for (const [p, c] of r.trick) { const rel = ((p - player) % n + n) % n; if (rel) x[o + (rel - 1) * 52 + c] = 1; }
    o += 52 * (n - 1);
    if (r.trick.length) x[o + suitOf(r.trick[0][1])] = 1;
    o += 4;
    if (r.trick.length) { const [wp, wc] = r.winningEntry(r.trick); x[o + wc] = 1; x[o + 52 + ((wp - player) % n + n) % n] = 1; }
    o += 52 + n;
    const scale = 1 / mb;
    for (let rel = 0; rel < n; rel++) {
      const p = (player + rel) % n, b = r.bids[p], base = o + rel * 8;
      if (b != null) { x[base] = 1; x[base + 1] = b * scale; x[base + 3] = (b - r.tricksWon[p]) * scale; }
      x[base + 2] = r.tricksWon[p] * scale;
      for (let s = 0; s < 4; s++) if (r.void[p][s]) x[base + 4 + s] = 1;
    }
    o += 8 * n;
    x[o] = r.nCards * scale; x[o + 1] = (r.nCards - r.trickNo) * scale; x[o + 2] = r.phase === "bid" ? 1 : 0;
    o += 3;
    x[o + r.bidOrderPos(player)] = 1; o += n;
    if (r.phase === "play") x[o + r.trick.length] = 1;
    o += n;
    x[o] = (r.bids.reduce((s, b) => s + (b == null ? 0 : b), 0) - r.nCards) * scale; o += 1;
    const fb = r.phase === "bid" && r.current === player ? r.forbiddenBid() : null;
    if (fb != null) x[o + fb] = 1;
    o += mb + 1;
    if (o !== x.length) throw new Error("feature size mismatch");
    return x;
  }

  // ------------------------------------------------------------- network
  function halfToFloat(h) {
    const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
    if (e === 31) return f ? NaN : s * Infinity;
    return s * Math.pow(2, e - 15) * (1 + f / 1024);
  }

  class Net {
    constructor(manifest, buffer) {
      const u16 = new Uint16Array(buffer), all = new Float32Array(u16.length);
      const lut = new Float32Array(65536); for (let i = 0; i < 65536; i++) lut[i] = halfToFloat(i);
      for (let i = 0; i < u16.length; i++) all[i] = lut[u16[i]];
      this.scale = manifest.score_scale; this.numPlayers = manifest.num_players; this.nets = {};
      for (const name of Object.keys(manifest.nets)) {
        this.nets[name] = manifest.nets[name].map((L) => ({ in: L.in, out: L.out, w: all.subarray(L.w, L.w + L.in * L.out), b: all.subarray(L.b, L.b + L.out) }));
      }
      this.buf = new Float32Array(featureSize(this.numPlayers));
    }
    forward(name, x) {
      let h = x;
      const layers = this.nets[name];
      layers.forEach((L, li) => {
        const y = new Float32Array(L.out);
        for (let o = 0; o < L.out; o++) {
          let s = L.b[o]; const row = o * L.in;
          for (let i = 0; i < L.in; i++) s += L.w[row + i] * h[i];
          y[o] = li < layers.length - 1 && s < 0 ? 0 : s;
        }
        h = y;
      });
      return h;
    }
    /** Expected round score (points) of every action for `player` in round `r`. */
    qValues(r, player) {
      const q = this.forward(r.phase === "bid" ? "bid" : "play", encode(r, player, this.buf));
      return Array.from(q, (v) => v * this.scale);
    }
    choose(r, player) {
      const q = this.qValues(r, player);
      const legal = r.phase === "bid" ? r.legalBids() : r.legalCards(player);
      let best = legal[0];
      for (const a of legal) if (q[a] > q[best]) best = a;
      return { action: best, q, legal };
    }
  }

  global.Rikiki = { NUM_CARDS, suitOf, rankOf, DEFAULT_RULES, roundSizes, shuffle, Round, maxBid, featureSize, encode, Net, halfToFloat };
})(typeof window !== "undefined" ? window : globalThis);
