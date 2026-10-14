(function () {
  const questions = window.SAA_C03_QUESTIONS || [];
  const ExamDeck = window.ExamDeck;
  const EXAM_SIZE = 65;
  const EXAM_MINUTES = 130;
  const PASS_PERCENT = 72;
  const WARNING_SECONDS = 10 * 60;
  const HISTORY_LIMIT = 20;
  const keys = {
    mode: "saa-c03-mode",
    exam: "saa-c03-exam-state",
    deck: "saa-c03-exam-deck",
    history: "saa-c03-exam-history",
  };
  const reviewLabels = { all: "Tất cả", wrong: "Sai", skipped: "Bỏ trống", correct: "Đúng" };

  const els = {
    views: document.querySelectorAll("[data-view]"),
    modeButtons: document.querySelectorAll(".mode-switch button"),
    examModeBtn: document.getElementById("examModeBtn"),
    sideLabel: document.getElementById("examSideLabel"),
    sideValue: document.getElementById("examSideValue"),
    progressFill: document.getElementById("examProgressFill"),
    sideStats: document.getElementById("examSideStats"),
    reviewTabs: document.getElementById("reviewTabs"),
    reviewButtons: document.querySelectorAll("#reviewTabs button"),
    legend: document.getElementById("examLegend"),
    grid: document.getElementById("examGrid"),
    gridEmpty: document.getElementById("examGridEmpty"),
    stickyBar: document.querySelector("[data-view='exam'] .sticky-bar"),
    eyebrow: document.getElementById("examEyebrow"),
    title: document.getElementById("examTitle"),
    timer: document.getElementById("examTimer"),
    pauseBtn: document.getElementById("pauseBtn"),
    submitBtn: document.getElementById("submitExamBtn"),
    backBtn: document.getElementById("backBtn"),
    retakeBtn: document.getElementById("retakeBtn"),
    newExamBtn: document.getElementById("newExamBtn"),
    start: document.getElementById("examStart"),
    sizeFact: document.getElementById("examSizeFact"),
    minutesFact: document.getElementById("examMinutesFact"),
    passFact: document.getElementById("examPassFact"),
    ruleText: document.getElementById("examRuleText"),
    startBtn: document.getElementById("startExamBtn"),
    historyBlock: document.getElementById("historyBlock"),
    historyBody: document.getElementById("historyBody"),
    summary: document.getElementById("examSummary"),
    scoreRing: document.getElementById("scoreRing"),
    summaryPercent: document.getElementById("summaryPercent"),
    summaryVerdict: document.getElementById("summaryVerdict"),
    summaryDate: document.getElementById("summaryDate"),
    summaryAttempt: document.getElementById("summaryAttempt"),
    summaryCorrect: document.getElementById("summaryCorrect"),
    summaryWrong: document.getElementById("summaryWrong"),
    summaryUnanswered: document.getElementById("summaryUnanswered"),
    summaryTime: document.getElementById("summaryTime"),
    summaryNote: document.getElementById("summaryNote"),
    paused: document.getElementById("examPaused"),
    pausedRemaining: document.getElementById("pausedRemaining"),
    resumeBtn: document.getElementById("resumeBtn"),
    questionPanel: document.getElementById("examQuestionPanel"),
    modePill: document.getElementById("examModePill"),
    numberPill: document.getElementById("examNumberPill"),
    questionText: document.getElementById("examQuestionText"),
    answers: document.getElementById("examAnswers"),
    resultBox: document.getElementById("examResultBox"),
    prevBtn: document.getElementById("examPrevBtn"),
    flagBtn: document.getElementById("flagBtn"),
    nextBtn: document.getElementById("examNextBtn"),
  };

  const percentFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
  const dateFormat = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let mode = readStorage(keys.mode) === "exam" ? "exam" : "practice";
  let deck = ExamDeck.sync(readStorage(keys.deck), questions.length);
  let history = loadHistory();
  let exam = loadExam();
  let reviewFilter = "all";
  let timerId = null;

  function readStorage(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (error) {
      console.warn(`Could not load ${key}`, error);
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Could not save ${key}`, error);
    }
  }

  function validQuestionIds(ids) {
    return (
      Array.isArray(ids) &&
      ids.length > 0 &&
      ids.every((id) => Number.isInteger(id) && id >= 0 && id < questions.length)
    );
  }

  // Entries saved before retakes existed have no id or attempt count.
  function loadHistory() {
    const saved = readStorage(keys.history);
    return Array.isArray(saved)
      ? saved.filter((item) => item && item.total > 0).map((item) => ({ id: item.startedAt, attempts: 1, ...item }))
      : [];
  }

  function loadExam() {
    const saved = readStorage(keys.exam);
    const valid =
      saved &&
      saved.version === 1 &&
      (saved.status === "active" || saved.status === "finished") &&
      validQuestionIds(saved.questionIds);
    if (!valid) return null;
    return { answers: {}, flagged: [], current: 0, pausedAt: null, pausedMs: 0, ...saved };
  }

  function saveExam() {
    writeStorage(keys.exam, exam);
  }

  function normalizeLetters(letters) {
    return [...letters].sort().join("");
  }

  function examQuestion(position) {
    return questions[exam.questionIds[position]];
  }

  function pickedAt(position) {
    return exam.answers[position] || [];
  }

  function isAnswered(position) {
    return pickedAt(position).length === examQuestion(position).correct.length;
  }

  function isRight(position) {
    return normalizeLetters(pickedAt(position)) === normalizeLetters(examQuestion(position).correct);
  }

  function reviewStatus(position) {
    if (isRight(position)) return "correct";
    return pickedAt(position).length ? "wrong" : "skipped";
  }

  function examStatus() {
    if (!exam) return "idle";
    if (exam.status === "finished") return "finished";
    return exam.pausedAt ? "paused" : "active";
  }

  function scoreExam() {
    const total = exam.questionIds.length;
    let correct = 0;
    let unanswered = 0;
    exam.questionIds.forEach((_, position) => {
      const status = reviewStatus(position);
      if (status === "correct") correct += 1;
      else if (status === "skipped") unanswered += 1;
    });
    return { total, correct, unanswered, wrong: total - correct - unanswered, percent: (correct / total) * 100 };
  }

  function formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value) => String(value).padStart(2, "0");
    return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  }

  function formatPercent(value) {
    return `${percentFormat.format(value)}%`;
  }

  function remainingSeconds() {
    const now = exam.pausedAt || Date.now();
    return Math.max(0, Math.ceil((exam.endsAt - now) / 1000));
  }

  // Time actually spent answering, without pauses.
  function usedSeconds(item) {
    return Math.max(0, Math.round((item.finishedAt - item.startedAt - (item.pausedMs || 0)) / 1000));
  }

  function setStats(items) {
    els.sideStats.innerHTML = "";
    items.forEach(([value, label]) => {
      const span = document.createElement("span");
      const strong = document.createElement("b");
      strong.textContent = value;
      span.append(strong, ` ${label}`);
      els.sideStats.appendChild(span);
    });
  }

  function setLegend(items) {
    els.legend.innerHTML = "";
    items.forEach(([className, label]) => {
      const span = document.createElement("span");
      const swatch = document.createElement("i");
      swatch.className = `swatch ${className}`;
      span.append(swatch, label);
      els.legend.appendChild(span);
    });
  }

  function startExam() {
    if (!questions.length) return;
    const draw = ExamDeck.draw(deck, EXAM_SIZE);
    deck = draw.deck;
    writeStorage(keys.deck, deck);

    const now = Date.now();
    exam = {
      version: 1,
      status: "active",
      questionIds: draw.picked,
      answers: {},
      flagged: [],
      current: 0,
      startedAt: now,
      endsAt: now + EXAM_MINUTES * 60 * 1000,
      finishedAt: null,
      pausedAt: null,
      pausedMs: 0,
      timedOut: false,
    };
    saveExam();
    render();
    window.scrollTo(0, 0);
  }

  // Moves the deadline forward by the paused time and clears the pause.
  function applyResume() {
    const pausedFor = Date.now() - exam.pausedAt;
    exam.endsAt += pausedFor;
    exam.pausedMs = (exam.pausedMs || 0) + pausedFor;
    exam.pausedAt = null;
  }

  function pauseExam() {
    if (examStatus() !== "active" || !ensureTimeLeft()) return;
    exam.pausedAt = Date.now();
    saveExam();
    render();
  }

  function resumeExam() {
    if (examStatus() !== "paused") return;
    applyResume();
    saveExam();
    render();
  }

  // A retake replaces the history entry of the exam it came from (moving it to
  // the top), so history always holds each exam's latest answers.
  function finishExam(timedOut) {
    if (!exam || exam.status !== "active") return;
    if (exam.pausedAt) applyResume();
    exam.status = "finished";
    exam.timedOut = timedOut;
    exam.finishedAt = Math.min(Date.now(), exam.endsAt);
    exam.current = 0;
    exam.historyId = exam.historyId || exam.startedAt;
    exam.attempt = exam.attempt || 1;
    reviewFilter = "all";

    const score = scoreExam();
    const entry = {
      id: exam.historyId,
      attempts: exam.attempt,
      previous: exam.previous || null,
      startedAt: exam.startedAt,
      finishedAt: exam.finishedAt,
      pausedMs: exam.pausedMs,
      timedOut,
      correct: score.correct,
      total: score.total,
      questionIds: exam.questionIds,
      answers: exam.answers,
    };
    history = [entry, ...history.filter((item) => item.id !== entry.id)].slice(0, HISTORY_LIMIT);
    writeStorage(keys.history, history);
    saveExam();
    render();
  }

  function openHistory(item) {
    exam = {
      version: 1,
      status: "finished",
      questionIds: item.questionIds,
      answers: item.answers || {},
      flagged: [],
      current: 0,
      startedAt: item.startedAt,
      endsAt: item.finishedAt,
      finishedAt: item.finishedAt,
      pausedAt: null,
      pausedMs: item.pausedMs || 0,
      timedOut: Boolean(item.timedOut),
      historyId: item.id,
      attempt: item.attempts,
      previous: item.previous || null,
    };
    reviewFilter = "all";
    saveExam();
    render();
    window.scrollTo(0, 0);
  }

  // Starts the same questions again, in the same order, with a fresh clock.
  // Retakes don't draw from the deck, so question coverage is unaffected.
  function retakeExam(item) {
    if (!validQuestionIds(item.questionIds)) return;
    const now = Date.now();
    exam = {
      version: 1,
      status: "active",
      questionIds: item.questionIds.slice(),
      answers: {},
      flagged: [],
      current: 0,
      startedAt: now,
      endsAt: now + EXAM_MINUTES * 60 * 1000,
      finishedAt: null,
      pausedAt: null,
      pausedMs: 0,
      timedOut: false,
      historyId: item.id,
      attempt: (item.attempts || 1) + 1,
      previous: { correct: item.correct, total: item.total, finishedAt: item.finishedAt },
    };
    reviewFilter = "all";
    saveExam();
    render();
    window.scrollTo(0, 0);
  }

  function retakeCurrent() {
    const score = scoreExam();
    retakeExam({
      id: exam.historyId || exam.startedAt,
      attempts: exam.attempt || 1,
      questionIds: exam.questionIds,
      correct: score.correct,
      total: score.total,
      finishedAt: exam.finishedAt,
    });
  }

  // Returns false (and submits) when time ran out while the page was idle.
  function ensureTimeLeft() {
    if (examStatus() === "active" && remainingSeconds() <= 0) {
      finishExam(true);
      return false;
    }
    return true;
  }

  function submitExam() {
    if (!ensureTimeLeft()) return;
    const missing = exam.questionIds.filter((_, position) => !isAnswered(position)).length;
    const flagged = exam.flagged.length;
    const notes = [
      missing ? `${missing} câu chưa trả lời` : "",
      flagged ? `${flagged} câu đang đánh dấu xem lại` : "",
    ].filter(Boolean);
    const message = notes.length ? `Bạn còn ${notes.join(" và ")}. Vẫn nộp bài?` : "Nộp bài và xem kết quả?";
    if (window.confirm(message)) finishExam(false);
  }

  function visiblePositions() {
    const all = exam.questionIds.map((_, position) => position);
    if (exam.status !== "finished" || reviewFilter === "all") return all;
    return all.filter((position) => reviewStatus(position) === reviewFilter);
  }

  function neighbour(direction) {
    const visible = visiblePositions();
    return direction > 0
      ? visible.find((position) => position > exam.current)
      : visible.filter((position) => position < exam.current).pop();
  }

  // Keeps the question in view on small screens, where the grid sits above it.
  function revealQuestion() {
    const top = els.questionPanel.getBoundingClientRect().top;
    const barHeight = els.stickyBar ? els.stickyBar.offsetHeight : 0;
    if (top < barHeight || top > window.innerHeight * 0.6) {
      els.questionPanel.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  function goTo(position) {
    if (examStatus() === "paused") return;
    exam.current = Math.max(0, Math.min(exam.questionIds.length - 1, position));
    saveExam();
    render();
    revealQuestion();
  }

  function setReviewFilter(filter) {
    reviewFilter = filter;
    const visible = visiblePositions();
    if (visible.length && !visible.includes(exam.current)) exam.current = visible[0];
    render();
  }

  function choose(letter) {
    if (examStatus() !== "active" || !ensureTimeLeft()) return;
    const question = examQuestion(exam.current);
    const required = question.correct.length;
    const picked = new Set(pickedAt(exam.current));

    if (required === 1) {
      picked.clear();
      picked.add(letter);
    } else if (picked.has(letter)) {
      picked.delete(letter);
    } else if (picked.size < required) {
      picked.add(letter);
    } else {
      return;
    }

    if (picked.size) exam.answers[exam.current] = [...picked].sort();
    else delete exam.answers[exam.current];
    saveExam();
    render();
  }

  function toggleFlag() {
    const position = exam.current;
    exam.flagged = exam.flagged.includes(position)
      ? exam.flagged.filter((item) => item !== position)
      : [...exam.flagged, position];
    saveExam();
    render();
  }

  function tick() {
    if (examStatus() !== "active") {
      stopTimer();
      return;
    }
    if (!ensureTimeLeft()) return;
    renderTimer();
  }

  function startTimer() {
    if (!timerId) timerId = window.setInterval(tick, 1000);
  }

  function stopTimer() {
    window.clearInterval(timerId);
    timerId = null;
  }

  function renderTimer() {
    const left = remainingSeconds();
    const text = formatDuration(left);
    const paused = Boolean(exam.pausedAt);
    els.timer.textContent = text;
    els.timer.classList.toggle("warning", !paused && left <= WARNING_SECONDS);
    els.timer.classList.toggle("paused", paused);
    els.pausedRemaining.textContent = text;
    els.examModeBtn.textContent = mode === "practice" ? `Thi thử · ${paused ? "tạm dừng" : text}` : "Thi thử";
  }

  function renderMode() {
    els.views.forEach((view) => {
      view.hidden = view.dataset.view !== mode;
    });
    els.modeButtons.forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
  }

  function renderSidebar() {
    const status = examStatus();
    els.grid.innerHTML = "";
    els.reviewTabs.hidden = status !== "finished";
    els.gridEmpty.hidden = true;

    if (status === "idle") {
      const { cycle, seen, size } = ExamDeck.coverage(deck);
      const left = size - seen;
      els.sideLabel.textContent = `Độ phủ bộ đề · vòng ${cycle}`;
      els.sideValue.textContent = `${seen}/${size}`;
      els.progressFill.style.width = `${size ? Math.round((seen / size) * 100) : 0}%`;
      setStats([
        [left, "câu chưa ra"],
        [Math.ceil(left / EXAM_SIZE), "đề nữa hết vòng"],
      ]);
      setLegend([]);
      return;
    }

    const total = exam.questionIds.length;
    if (status === "finished") {
      const score = scoreExam();
      els.sideLabel.textContent = "Điểm";
      els.sideValue.textContent = `${score.correct}/${score.total}`;
      els.progressFill.style.width = `${Math.round(score.percent)}%`;
      setStats([
        [score.correct, "đúng"],
        [score.wrong, "sai"],
        [score.unanswered, "bỏ trống"],
      ]);
      setLegend([
        ["correct", "Đúng"],
        ["wrong", "Sai"],
        ["skipped", "Bỏ trống"],
      ]);
      const counts = { all: total, correct: score.correct, wrong: score.wrong, skipped: score.unanswered };
      els.reviewButtons.forEach((button) => {
        const filter = button.dataset.reviewFilter;
        button.textContent = `${reviewLabels[filter]} · ${counts[filter]}`;
        button.classList.toggle("active", filter === reviewFilter);
      });
    } else {
      const answered = exam.questionIds.filter((_, position) => isAnswered(position)).length;
      els.sideLabel.textContent = "Đã trả lời";
      els.sideValue.textContent = `${answered}/${total}`;
      els.progressFill.style.width = `${Math.round((answered / total) * 100)}%`;
      setStats([
        [exam.flagged.length, "đánh dấu"],
        [total - answered, "chưa làm"],
      ]);
      if (status === "paused") {
        setLegend([]);
        return;
      }
      setLegend([
        ["answered", "Đã trả lời"],
        ["flagged", "Đánh dấu"],
        ["current", "Đang xem"],
      ]);
    }

    const visible = visiblePositions();
    els.gridEmpty.hidden = visible.length > 0;
    visible.forEach((position) => {
      const classes = [position === exam.current ? "current" : ""];
      if (status === "active") {
        if (isAnswered(position)) classes.push("answered");
        if (exam.flagged.includes(position)) classes.push("flagged");
      } else {
        classes.push(reviewStatus(position));
      }

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = position + 1;
      button.className = classes.filter(Boolean).join(" ");
      button.addEventListener("click", () => goTo(position));
      els.grid.appendChild(button);
    });
  }

  function renderStart() {
    const size = questions.length;
    els.eyebrow.textContent = "AWS Certified Solutions Architect Associate";
    els.title.textContent = "Thi thử ngẫu nhiên";
    els.ruleText.textContent =
      `Mỗi đề rút ${EXAM_SIZE} câu từ bộ ${size} câu theo cơ chế xoay vòng: mỗi câu xuất hiện đúng 1 lần ` +
      `trong mỗi vòng (khoảng ${Math.ceil(size / EXAM_SIZE)} đề) rồi mới được lặp lại, nên mọi câu đều được ra ` +
      "với tỷ lệ như nhau, không câu nào bị lặp nhiều hay bị bỏ sót. Hai đề liên tiếp không trùng câu nào.";
    els.startBtn.disabled = !size;

    els.historyBlock.hidden = !history.length;
    els.historyBody.innerHTML = "";
    history.forEach((item) => {
      const percent = (item.correct / item.total) * 100;
      const passed = percent >= PASS_PERCENT;
      const cells = [
        dateFormat.format(new Date(item.startedAt)),
        `${item.correct}/${item.total} (${formatPercent(percent)})`,
        formatDuration(usedSeconds(item)) + (item.timedOut ? " (hết giờ)" : ""),
      ];
      const row = document.createElement("tr");
      cells.forEach((text) => {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.appendChild(cell);
      });
      if (item.attempts > 1) {
        const note = document.createElement("small");
        note.className = "history-sub";
        note.textContent = item.previous
          ? `Lần ${item.attempts} · trước ${item.previous.correct}/${item.previous.total}`
          : `Lần ${item.attempts}`;
        row.children[1].appendChild(note);
      }

      const verdict = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `verdict ${passed ? "pass" : "fail"}`;
      badge.textContent = passed ? "Đạt" : "Chưa đạt";
      verdict.appendChild(badge);
      row.appendChild(verdict);

      const action = document.createElement("td");
      action.className = "history-action";
      if (validQuestionIds(item.questionIds)) {
        const review = document.createElement("button");
        review.type = "button";
        review.className = "link-btn";
        review.textContent = "Xem lại";
        review.addEventListener("click", () => openHistory(item));

        const retake = document.createElement("button");
        retake.type = "button";
        retake.className = "link-btn";
        retake.textContent = "Làm lại";
        retake.addEventListener("click", () => retakeExam(item));
        action.append(review, retake);
      }
      row.appendChild(action);
      els.historyBody.appendChild(row);
    });
  }

  function renderSummary() {
    const score = scoreExam();
    const passed = score.percent >= PASS_PERCENT;
    const tone = passed ? "pass" : "fail";
    els.scoreRing.className = `score-ring ${tone}`;
    els.scoreRing.style.setProperty("--score", score.percent.toFixed(1));
    els.summaryPercent.textContent = formatPercent(score.percent);
    els.summaryVerdict.textContent = passed ? "Đạt" : "Chưa đạt";
    els.summaryVerdict.className = `verdict ${tone}`;
    els.summaryDate.textContent = `Thi lúc ${dateFormat.format(new Date(exam.startedAt))}`;
    const previous = exam.attempt > 1 ? exam.previous : null;
    els.summaryAttempt.hidden = !(exam.attempt > 1);
    if (exam.attempt > 1) {
      const change = previous ? score.correct - previous.correct : 0;
      const changeText = change > 0 ? `+${change}` : String(change);
      els.summaryAttempt.textContent = previous
        ? `Lần làm thứ ${exam.attempt} · lần trước ${previous.correct}/${previous.total} (${changeText} câu)`
        : `Lần làm thứ ${exam.attempt}`;
      els.summaryAttempt.className = `summary-attempt ${change > 0 ? "up" : change < 0 ? "down" : ""}`;
    }
    els.summaryCorrect.textContent = score.correct;
    els.summaryWrong.textContent = score.wrong;
    els.summaryUnanswered.textContent = score.unanswered;
    els.summaryTime.textContent = formatDuration(usedSeconds(exam));
    els.summaryNote.textContent =
      (exam.timedOut ? "Hết giờ, bài đã được tự động nộp. " : "") +
      `Ngưỡng đạt ước tính ${PASS_PERCENT}% (tương đương 720/1000 điểm thang AWS). ` +
      "Chọn từng câu để xem lại đáp án, hoặc lọc riêng câu sai.";
  }

  function renderResult(question, picked) {
    const strong = document.createElement("strong");
    let detail;
    if (normalizeLetters(picked) === normalizeLetters(question.correct)) {
      strong.textContent = "Đúng.";
      detail = ` Đáp án là ${question.correct}.`;
      els.resultBox.className = "result-box good";
    } else {
      strong.textContent = picked.length ? "Chưa đúng." : "Bỏ trống.";
      detail = picked.length
        ? ` Bạn chọn ${normalizeLetters(picked)}; đáp án đúng là ${question.correct}.`
        : ` Đáp án đúng là ${question.correct}.`;
      els.resultBox.className = "result-box bad";
    }
    els.resultBox.replaceChildren(strong, detail);
    els.resultBox.hidden = false;
  }

  function renderQuestion() {
    const position = exam.current;
    const total = exam.questionIds.length;
    const question = examQuestion(position);
    const required = question.correct.length;
    const picked = pickedAt(position);
    const reviewing = exam.status === "finished";
    const flagged = exam.flagged.includes(position);
    const hasNext = neighbour(1) !== undefined;

    const attemptLabel = exam.attempt > 1 ? ` · lần ${exam.attempt}` : "";
    els.eyebrow.textContent = reviewing ? `Xem lại đáp án${attemptLabel}` : `Đề thi thử${attemptLabel || " ngẫu nhiên"}`;
    els.title.textContent = `Câu ${position + 1}/${total}`;
    els.modePill.textContent = required > 1 ? `Chọn ${required} đáp án` : "Một đáp án";
    els.numberPill.textContent = `Câu gốc #${question.number}`;
    els.questionText.textContent = question.text;

    els.answers.innerHTML = "";
    els.answers.classList.toggle("locked", reviewing);
    question.options.forEach((option) => {
      const isPicked = picked.includes(option.letter);
      const isAnswer = question.correct.includes(option.letter);
      const button = document.createElement("button");
      button.type = "button";
      button.className = [
        "answer-btn",
        isPicked ? "selected" : "",
        reviewing && isAnswer ? "correct-answer" : "",
        reviewing && isPicked && !isAnswer ? "wrong-answer" : "",
      ]
        .filter(Boolean)
        .join(" ");
      button.setAttribute("aria-pressed", String(isPicked));

      const letter = document.createElement("span");
      letter.className = "letter";
      letter.textContent = option.letter;
      const text = document.createElement("span");
      text.textContent = option.text;
      button.append(letter, text);

      if (!reviewing) button.addEventListener("click", () => choose(option.letter));
      els.answers.appendChild(button);
    });

    if (reviewing) {
      renderResult(question, picked);
    } else {
      els.resultBox.hidden = true;
    }

    els.prevBtn.disabled = neighbour(-1) === undefined;
    els.flagBtn.hidden = reviewing;
    els.flagBtn.textContent = flagged ? "Bỏ đánh dấu" : "Đánh dấu xem lại";
    els.flagBtn.classList.toggle("active", flagged);
    els.nextBtn.textContent = !reviewing && !hasNext ? "Nộp bài" : "Tiếp";
    els.nextBtn.disabled = reviewing && !hasNext;
  }

  function renderMain() {
    const status = examStatus();
    const running = status === "active" || status === "paused";
    els.start.hidden = status !== "idle";
    els.summary.hidden = status !== "finished";
    els.paused.hidden = status !== "paused";
    els.questionPanel.hidden = status === "idle" || status === "paused";
    els.timer.hidden = !running;
    els.pauseBtn.hidden = !running;
    els.pauseBtn.textContent = status === "paused" ? "Tiếp tục" : "Tạm dừng";
    els.submitBtn.hidden = status !== "active";
    els.backBtn.hidden = status !== "finished";
    els.retakeBtn.hidden = status !== "finished";
    els.newExamBtn.hidden = status !== "finished";

    if (status === "idle") {
      renderStart();
      return;
    }
    if (status === "finished") renderSummary();
    renderQuestion();
  }

  function render() {
    renderMode();
    renderSidebar();
    renderMain();

    const status = examStatus();
    if (status === "active" || status === "paused") renderTimer();
    else els.examModeBtn.textContent = "Thi thử";

    if (status === "active") startTimer();
    else stopTimer();
  }

  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      writeStorage(keys.mode, mode);
      render();
    });
  });

  els.reviewButtons.forEach((button) => {
    button.addEventListener("click", () => setReviewFilter(button.dataset.reviewFilter));
  });

  els.startBtn.addEventListener("click", startExam);
  els.newExamBtn.addEventListener("click", startExam);
  els.submitBtn.addEventListener("click", submitExam);
  els.resumeBtn.addEventListener("click", resumeExam);
  els.flagBtn.addEventListener("click", toggleFlag);

  els.pauseBtn.addEventListener("click", () => {
    if (examStatus() === "paused") resumeExam();
    else pauseExam();
  });

  els.prevBtn.addEventListener("click", () => {
    const target = neighbour(-1);
    if (target !== undefined) goTo(target);
  });

  els.nextBtn.addEventListener("click", () => {
    const target = neighbour(1);
    if (target !== undefined) goTo(target);
    else if (examStatus() === "active") submitExam();
  });

  els.retakeBtn.addEventListener("click", retakeCurrent);

  els.backBtn.addEventListener("click", () => {
    exam = null;
    saveExam();
    render();
  });

  els.sizeFact.textContent = EXAM_SIZE;
  els.minutesFact.textContent = EXAM_MINUTES;
  els.passFact.textContent = `${PASS_PERCENT}%`;
  writeStorage(keys.deck, deck);

  if (examStatus() === "active" && remainingSeconds() <= 0) {
    finishExam(true);
  } else {
    render();
  }
})();
