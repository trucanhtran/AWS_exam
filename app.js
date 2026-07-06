(function () {
  const questions = window.SAA_C03_QUESTIONS || [];
  const storageKey = "saa-c03-practice-state";

  const els = {
    questionCount: document.getElementById("questionCount"),
    progressText: document.getElementById("progressText"),
    progressFill: document.getElementById("progressFill"),
    correctCount: document.getElementById("correctCount"),
    wrongCount: document.getElementById("wrongCount"),
    questionGrid: document.getElementById("questionGrid"),
    searchInput: document.getElementById("searchInput"),
    questionTitle: document.getElementById("questionTitle"),
    questionText: document.getElementById("questionText"),
    answers: document.getElementById("answers"),
    resultBox: document.getElementById("resultBox"),
    modePill: document.getElementById("modePill"),
    votePill: document.getElementById("votePill"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    checkBtn: document.getElementById("checkBtn"),
    resetBtn: document.getElementById("resetBtn"),
  };

  let state = loadState();
  let currentIndex = Math.min(state.currentIndex || 0, Math.max(questions.length - 1, 0));
  let filter = "all";
  let query = "";
  let selected = new Set(state.answers[currentIndex]?.selected || []);

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && saved.version === 1) return saved;
    } catch (error) {
      console.warn("Could not load saved progress", error);
    }
    return { version: 1, currentIndex: 0, answers: {} };
  }

  function saveState() {
    state.currentIndex = currentIndex;
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function normalizeLetters(letters) {
    return [...letters].sort().join("");
  }

  function isCorrect(question, letters) {
    return normalizeLetters(letters) === normalizeLetters(question.correct);
  }

  function renderStats() {
    const answered = Object.values(state.answers).filter((item) => item.revealed).length;
    const correct = Object.values(state.answers).filter((item) => item.revealed && item.correct).length;
    const wrong = answered - correct;
    const total = questions.length || 1;

    els.questionCount.textContent = `${questions.length} câu hỏi`;
    els.progressText.textContent = `${answered}/${questions.length}`;
    els.progressFill.style.width = `${Math.round((answered / total) * 100)}%`;
    els.correctCount.textContent = correct;
    els.wrongCount.textContent = wrong;
  }

  function questionMatches(question, index) {
    const saved = state.answers[index];
    const statusMatch =
      filter === "all" ||
      (filter === "unanswered" && !saved?.revealed) ||
      (filter === "wrong" && saved?.revealed && !saved.correct) ||
      (filter === "correct" && saved?.revealed && saved.correct);

    if (!statusMatch) return false;
    if (!query) return true;

    const haystack = `${question.number} ${question.text} ${question.options.map((item) => item.text).join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }

  function renderGrid() {
    els.questionGrid.innerHTML = "";
    questions.forEach((question, index) => {
      if (!questionMatches(question, index)) return;

      const saved = state.answers[index];
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = question.number;
      button.className = [
        index === currentIndex ? "current" : "",
        saved?.revealed ? (saved.correct ? "correct" : "wrong") : "",
      ]
        .filter(Boolean)
        .join(" ");
      button.addEventListener("click", () => {
        currentIndex = index;
        selected = new Set(state.answers[currentIndex]?.selected || []);
        render();
      });
      els.questionGrid.appendChild(button);
    });
  }

  function revealAnswer() {
    const question = questions[currentIndex];
    const picked = normalizeLetters(selected);
    if (!picked) return;

    state.answers[currentIndex] = {
      selected: [...selected],
      revealed: true,
      correct: isCorrect(question, picked),
    };
    saveState();
    render();
  }

  function renderResult(question, saved) {
    if (!saved?.revealed) {
      els.resultBox.hidden = true;
      els.resultBox.className = "result-box";
      els.resultBox.textContent = "";
      return;
    }

    const picked = normalizeLetters(saved.selected.join(""));
    els.resultBox.hidden = false;
    els.resultBox.className = `result-box ${saved.correct ? "good" : "bad"}`;
    els.resultBox.innerHTML = saved.correct
      ? `<strong>Đúng.</strong> Đáp án là ${question.correct}.`
      : `<strong>Chưa đúng.</strong> Bạn chọn ${picked || "chưa chọn"}; đáp án đúng là ${question.correct}.`;
  }

  function renderQuestion() {
    const question = questions[currentIndex];
    const saved = state.answers[currentIndex];
    const required = question.correct.length;
    const revealed = Boolean(saved?.revealed);

    selected = new Set(saved?.selected || [...selected]);
    els.questionTitle.textContent = `Question ${question.number}`;
    els.questionText.textContent = question.text;
    els.modePill.textContent = required > 1 ? `Chọn ${required} đáp án` : "Một đáp án";
    els.votePill.hidden = !revealed;
    els.votePill.textContent = revealed ? `Top vote: ${question.correct} (${question.votes[0]?.votes || 0} votes)` : "";
    els.prevBtn.disabled = currentIndex === 0;
    els.nextBtn.disabled = currentIndex === questions.length - 1;
    els.checkBtn.hidden = required === 1 || revealed;

    els.answers.innerHTML = "";
    question.options.forEach((option) => {
      const isPicked = selected.has(option.letter);
      const isAnswer = question.correct.includes(option.letter);
      const button = document.createElement("button");
      button.type = "button";
      button.className = [
        "answer-btn",
        isPicked ? "selected" : "",
        revealed && isAnswer ? "correct-answer" : "",
        revealed && isPicked && !isAnswer ? "wrong-answer" : "",
      ]
        .filter(Boolean)
        .join(" ");
      button.innerHTML = `<span class="letter">${option.letter}</span><span>${option.text}</span>`;
      button.addEventListener("click", () => {
        if (revealed) return;
        if (required === 1) {
          selected = new Set([option.letter]);
          revealAnswer();
          return;
        }
        if (selected.has(option.letter)) {
          selected.delete(option.letter);
        } else if (selected.size < required) {
          selected.add(option.letter);
        }
        renderQuestion();
      });
      els.answers.appendChild(button);
    });

    els.checkBtn.disabled = selected.size !== required;
    renderResult(question, saved);
  }

  function render() {
    if (!questions.length) {
      els.questionText.textContent = "Không tìm thấy câu hỏi trong dữ liệu.";
      return;
    }
    renderStats();
    renderGrid();
    renderQuestion();
  }

  document.querySelectorAll(".filter-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter-tabs button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      filter = button.dataset.filter;
      renderGrid();
    });
  });

  els.searchInput.addEventListener("input", (event) => {
    query = event.target.value.trim();
    renderGrid();
  });

  els.prevBtn.addEventListener("click", () => {
    currentIndex = Math.max(0, currentIndex - 1);
    selected = new Set(state.answers[currentIndex]?.selected || []);
    saveState();
    render();
  });

  els.nextBtn.addEventListener("click", () => {
    currentIndex = Math.min(questions.length - 1, currentIndex + 1);
    selected = new Set(state.answers[currentIndex]?.selected || []);
    saveState();
    render();
  });

  els.checkBtn.addEventListener("click", revealAnswer);

  els.resetBtn.addEventListener("click", () => {
    const ok = window.confirm("Xóa toàn bộ tiến độ và làm lại từ đầu?");
    if (!ok) return;
    state = { version: 1, currentIndex: 0, answers: {} };
    currentIndex = 0;
    selected = new Set();
    saveState();
    render();
  });

  render();
})();
