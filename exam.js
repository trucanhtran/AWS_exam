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

  const els = {
    views: document.querySelectorAll("[data-view]"),
    modeButtons: document.querySelectorAll(".mode-switch button"),
    examModeBtn: document.getElementById("examModeBtn"),
    sideLabel: document.getElementById("examSideLabel"),
    sideValue: document.getElementById("examSideValue"),
    progressFill: document.getElementById("examProgressFill"),
    sideStats: document.getElementById("examSideStats"),
    legend: document.getElementById("examLegend"),
    grid: document.getElementById("examGrid"),
    eyebrow: document.getElementById("examEyebrow"),
    title: document.getElementById("examTitle"),
    timer: document.getElementById("examTimer"),
    submitBtn: document.getElementById("submitExamBtn"),
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
    summaryPercent: document.getElementById("summaryPercent"),
    summaryVerdict: document.getElementById("summaryVerdict"),
    summaryCorrect: document.getElementById("summaryCorrect"),
    summaryWrong: document.getElementById("summaryWrong"),
    summaryUnanswered: document.getElementById("summaryUnanswered"),
    summaryTime: document.getElementById("summaryTime"),
    summaryNote: document.getElementById("summaryNote"),
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

  let mode = readStorage(keys.mode) === "exam" ? "exam" : "practice";
  let deck = ExamDeck.sync(readStorage(keys.deck), questions.length);
  let history = loadHistory();
  let exam = loadExam();
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

  function loadHistory() {
    const saved = readStorage(keys.history);
    return Array.isArray(saved) ? saved.filter((item) => item && item.total > 0) : [];
  }

  function loadExam() {
    const saved = readStorage(keys.exam);
    const valid =
      saved &&
      saved.version === 1 &&
      (saved.status === "active" || saved.status === "finished") &&
      Array.isArray(saved.questionIds) &&
      saved.questionIds.length > 0 &&
      saved.questionIds.every((id) => Number.isInteger(id) && id >= 0 && id < questions.length);
    if (!valid) return null;
    return { answers: {}, flagged: [], current: 0, ...saved };
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

  function scoreExam() {
    const total = exam.questionIds.length;
    let correct = 0;
    let unanswered = 0;
    exam.questionIds.forEach((_, position) => {
      if (isRight(position)) correct += 1;
      else if (!pickedAt(position).length) unanswered += 1;
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
    return Math.max(0, Math.ceil((exam.endsAt - Date.now()) / 1000));
  }

  function usedSeconds(item) {
    return Math.round((item.finishedAt - item.startedAt) / 1000);
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
      timedOut: false,
    };
    saveExam();
    render();
  }

  function finishExam(timedOut) {
    if (!exam || exam.status !== "active") return;
    exam.status = "finished";
    exam.timedOut = timedOut;
    exam.finishedAt = Math.min(Date.now(), exam.endsAt);
    exam.current = 0;

    const score = scoreExam();
    history = [
      {
        startedAt: exam.startedAt,
        finishedAt: exam.finishedAt,
        correct: score.correct,
        total: score.total,
        timedOut,
      },
      ...history,
    ].slice(0, HISTORY_LIMIT);
    writeStorage(keys.history, history);
    saveExam();
    render();
  }

  // Returns false (and submits) when time ran out while the page was idle.
  function ensureTimeLeft() {
    if (exam.status === "active" && remainingSeconds() <= 0) {
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

  function goTo(position) {
    exam.current = Math.max(0, Math.min(exam.questionIds.length - 1, position));
    saveExam();
    render();
  }

  function choose(letter) {
    if (!ensureTimeLeft()) return;
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
    if (!exam || exam.status !== "active") {
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
    els.timer.textContent = text;
    els.timer.classList.toggle("warning", left <= WARNING_SECONDS);
    els.examModeBtn.textContent = mode === "practice" ? `Thi thử · ${text}` : "Thi thử";
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
    els.grid.innerHTML = "";

    if (!exam) {
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
    if (exam.status === "active") {
      const answered = exam.questionIds.filter((_, position) => isAnswered(position)).length;
      els.sideLabel.textContent = "Đã trả lời";
      els.sideValue.textContent = `${answered}/${total}`;
      els.progressFill.style.width = `${Math.round((answered / total) * 100)}%`;
      setStats([
        [exam.flagged.length, "đánh dấu"],
        [total - answered, "chưa làm"],
      ]);
      setLegend([
        ["answered", "Đã trả lời"],
        ["flagged", "Đánh dấu"],
        ["current", "Đang xem"],
      ]);
    } else {
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
    }

    exam.questionIds.forEach((_, position) => {
      const classes = [position === exam.current ? "current" : ""];
      if (exam.status === "active") {
        if (isAnswered(position)) classes.push("answered");
        if (exam.flagged.includes(position)) classes.push("flagged");
      } else if (isRight(position)) {
        classes.push("correct");
      } else {
        classes.push(pickedAt(position).length ? "wrong" : "skipped");
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
        new Date(item.startedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }),
        `${item.correct}/${item.total} (${formatPercent(percent)})`,
        formatDuration(usedSeconds(item)) + (item.timedOut ? " (hết giờ)" : ""),
        passed ? "Đạt" : "Chưa đạt",
      ];
      const row = document.createElement("tr");
      cells.forEach((text, index) => {
        const cell = document.createElement("td");
        cell.textContent = text;
        if (index === cells.length - 1) cell.className = passed ? "pass" : "fail";
        row.appendChild(cell);
      });
      els.historyBody.appendChild(row);
    });
  }

  function renderSummary() {
    const score = scoreExam();
    const passed = score.percent >= PASS_PERCENT;
    els.summaryPercent.textContent = formatPercent(score.percent);
    els.summaryVerdict.textContent = passed ? "Đạt" : "Chưa đạt";
    els.summaryVerdict.className = `verdict ${passed ? "pass" : "fail"}`;
    els.summaryCorrect.textContent = score.correct;
    els.summaryWrong.textContent = score.wrong;
    els.summaryUnanswered.textContent = score.unanswered;
    els.summaryTime.textContent = formatDuration(usedSeconds(exam));
    els.summaryNote.textContent =
      (exam.timedOut ? "Hết giờ, bài đã được tự động nộp. " : "") +
      `Ngưỡng đạt ước tính ${PASS_PERCENT}% (tương đương 720/1000 điểm thang AWS). Chọn từng câu để xem lại đáp án.`;
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
    const isLast = position === total - 1;

    els.eyebrow.textContent = reviewing ? "Kết quả đề thi thử" : "Đề thi thử ngẫu nhiên";
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

    els.prevBtn.disabled = position === 0;
    els.flagBtn.hidden = reviewing;
    els.flagBtn.textContent = flagged ? "Bỏ đánh dấu" : "Đánh dấu xem lại";
    els.flagBtn.classList.toggle("active", flagged);
    els.nextBtn.textContent = !reviewing && isLast ? "Nộp bài" : "Tiếp";
    els.nextBtn.disabled = reviewing && isLast;
  }

  function renderMain() {
    const status = exam ? exam.status : "idle";
    els.start.hidden = status !== "idle";
    els.summary.hidden = status !== "finished";
    els.questionPanel.hidden = status === "idle";
    els.timer.hidden = status !== "active";
    els.submitBtn.hidden = status !== "active";
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

    if (exam && exam.status === "active") {
      renderTimer();
      startTimer();
    } else {
      stopTimer();
      els.examModeBtn.textContent = "Thi thử";
    }
  }

  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      writeStorage(keys.mode, mode);
      render();
    });
  });

  els.startBtn.addEventListener("click", startExam);
  els.submitBtn.addEventListener("click", submitExam);
  els.flagBtn.addEventListener("click", toggleFlag);
  els.prevBtn.addEventListener("click", () => goTo(exam.current - 1));

  els.nextBtn.addEventListener("click", () => {
    if (exam.status === "active" && exam.current === exam.questionIds.length - 1) {
      submitExam();
      return;
    }
    goTo(exam.current + 1);
  });

  els.newExamBtn.addEventListener("click", () => {
    exam = null;
    saveExam();
    render();
  });

  els.sizeFact.textContent = EXAM_SIZE;
  els.minutesFact.textContent = EXAM_MINUTES;
  els.passFact.textContent = `${PASS_PERCENT}%`;
  writeStorage(keys.deck, deck);

  if (exam && exam.status === "active" && remainingSeconds() <= 0) {
    finishExam(true);
  } else {
    render();
  }
})();
