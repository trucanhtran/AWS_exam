// Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const ExamDeck = require("../exam-deck.js");

const BANK_SIZE = 1015;
const EXAM_SIZE = 65;

function seededRandom(seed) {
  let value = seed >>> 0;
  return function () {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("each exam has the requested number of distinct, valid questions", () => {
  const random = seededRandom(1);
  let deck = ExamDeck.create(BANK_SIZE, random);
  for (let exam = 0; exam < 50; exam += 1) {
    const result = ExamDeck.draw(deck, EXAM_SIZE, random);
    deck = result.deck;
    assert.equal(result.picked.length, EXAM_SIZE);
    assert.equal(new Set(result.picked).size, EXAM_SIZE);
    result.picked.forEach((index) => assert.ok(index >= 0 && index < BANK_SIZE));
  }
});

test("every question appears equally often (counts never differ by more than 1)", () => {
  const random = seededRandom(2);
  const counts = new Array(BANK_SIZE).fill(0);
  let deck = ExamDeck.create(BANK_SIZE, random);

  for (let exam = 1; exam <= 406; exam += 1) {
    const result = ExamDeck.draw(deck, EXAM_SIZE, random);
    deck = result.deck;
    result.picked.forEach((index) => (counts[index] += 1));

    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `uneven after exam ${exam}`);
    const total = exam * EXAM_SIZE;
    assert.equal(ExamDeck.coverage(deck).seen, total % BANK_SIZE);
    assert.equal(ExamDeck.coverage(deck).cycle, Math.floor(total / BANK_SIZE) + 1);
  }

  // 406 exams x 65 questions = exactly 26 full cycles of 1015 questions.
  assert.ok(counts.every((count) => count === 26));
});

test("no question repeats in two consecutive exams, even across cycles", () => {
  const random = seededRandom(3);
  let deck = ExamDeck.create(BANK_SIZE, random);
  let previous = new Set();
  for (let exam = 0; exam < 300; exam += 1) {
    const result = ExamDeck.draw(deck, EXAM_SIZE, random);
    deck = result.deck;
    result.picked.forEach((index) => assert.ok(!previous.has(index), `question ${index} repeated`));
    previous = new Set(result.picked);
  }
});

test("sync keeps progress and adapts when the bank size changes", () => {
  const random = seededRandom(4);
  let deck = ExamDeck.create(BANK_SIZE, random);
  deck = ExamDeck.draw(deck, EXAM_SIZE, random).deck;

  const same = ExamDeck.sync(JSON.parse(JSON.stringify(deck)), BANK_SIZE, random);
  assert.deepEqual(same, deck);

  const grown = ExamDeck.sync(deck, BANK_SIZE + 10, random);
  assert.equal(grown.remaining.length, deck.remaining.length + 10);
  for (let index = BANK_SIZE; index < BANK_SIZE + 10; index += 1) assert.ok(grown.remaining.includes(index));

  const shrunk = ExamDeck.sync(deck, 500, random);
  assert.ok(shrunk.remaining.every((index) => index < 500));
  assert.equal(new Set(shrunk.remaining).size, shrunk.remaining.length);
});

test("sync replaces missing or corrupted saved data with a fresh deck", () => {
  [null, undefined, {}, { version: 99 }, "oops"].forEach((saved) => {
    const deck = ExamDeck.sync(saved, BANK_SIZE, seededRandom(5));
    assert.deepEqual(ExamDeck.coverage(deck), { cycle: 1, seen: 0, size: BANK_SIZE });
    assert.equal(new Set(deck.remaining).size, BANK_SIZE);
  });
});
