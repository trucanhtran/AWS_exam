// Shuffle-bag ("deck") for picking random exam questions so every question in
// the bank appears equally often: each question is drawn exactly once per cycle
// before any question is repeated.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.ExamDeck = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  const VERSION = 1;

  function range(start, end) {
    const items = [];
    for (let i = start; i < end; i += 1) items.push(i);
    return items;
  }

  function shuffle(items, random) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Insert items at random positions at or after minIndex.
  function insertFrom(list, items, minIndex, random) {
    const result = list.slice();
    items.forEach((item) => {
      const start = Math.min(minIndex, result.length);
      const position = start + Math.floor(random() * (result.length - start + 1));
      result.splice(position, 0, item);
    });
    return result;
  }

  function create(size, random = Math.random) {
    return { version: VERSION, size, cycle: 1, remaining: shuffle(range(0, size), random), last: [] };
  }

  function isValid(deck) {
    return (
      Boolean(deck) &&
      deck.version === VERSION &&
      Number.isInteger(deck.size) &&
      Number.isInteger(deck.cycle) &&
      Array.isArray(deck.remaining)
    );
  }

  // Restore a saved deck, adapting it if the question bank size changed.
  function sync(deck, size, random = Math.random) {
    if (!isValid(deck)) return create(size, random);

    const seen = new Set();
    const remaining = deck.remaining.filter((index) => {
      const ok = Number.isInteger(index) && index >= 0 && index < size && !seen.has(index);
      seen.add(index);
      return ok;
    });
    const added = shuffle(range(deck.size, size), random);
    const last = Array.isArray(deck.last) ? deck.last.filter((index) => Number.isInteger(index) && index < size) : [];
    return { version: VERSION, size, cycle: deck.cycle, remaining: insertFrom(remaining, added, 0, random), last };
  }

  function draw(deck, count, random = Math.random) {
    const want = Math.min(count, deck.size);
    if (want <= 0) return { picked: [], deck };

    const picked = deck.remaining.slice(0, want);
    let remaining = deck.remaining.slice(want);
    let cycle = deck.cycle;

    if (remaining.length === 0) {
      // Cycle finished: start a new one and top this draw up from it. Questions
      // from the previous exam are skipped when topping up, and questions already
      // in this draw are kept out of the new cycle's first slots, so no question
      // shows up in two exams in a row.
      const current = new Set(picked);
      const previous = new Set(deck.last || []);
      const fresh = shuffle(range(0, deck.size).filter((index) => !current.has(index)), random);
      const needed = want - picked.length;
      const topUp = fresh.filter((index) => !previous.has(index)).slice(0, needed);
      if (topUp.length < needed) {
        topUp.push(...fresh.filter((index) => previous.has(index)).slice(0, needed - topUp.length));
      }
      const used = new Set(topUp);
      picked.push(...topUp);
      remaining = insertFrom(
        fresh.filter((index) => !used.has(index)),
        shuffle([...current], random),
        want,
        random
      );
      cycle += 1;
    }

    return {
      picked: shuffle(picked, random),
      deck: { version: VERSION, size: deck.size, cycle, remaining, last: picked },
    };
  }

  function coverage(deck) {
    return { cycle: deck.cycle, seen: deck.size - deck.remaining.length, size: deck.size };
  }

  return { create, sync, draw, coverage };
});
