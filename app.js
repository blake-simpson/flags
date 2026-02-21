// ============================================================
// State
// ============================================================
const MASTERY_THRESHOLD = 3;

let state = {
  currentView: "quiz",
  quizContinent: "All",
  studyContinent: "All",
  searchQuery: "",
  // Quiz session
  correct: 0,
  wrong: 0,
  streak: 0,
  bestStreak: 0,
  currentQuestion: null,
  answered: false,
  // Persistent progress: { [countryCode]: { right: n, wrong: n } }
  progress: {},
};

// ============================================================
// Persistence
// ============================================================
function loadProgress() {
  try {
    const saved = localStorage.getItem("flags-progress");
    if (saved) state.progress = JSON.parse(saved);
    const best = localStorage.getItem("flags-best-streak");
    if (best) state.bestStreak = parseInt(best, 10) || 0;
  } catch {}
}

function saveProgress() {
  try {
    localStorage.setItem("flags-progress", JSON.stringify(state.progress));
    localStorage.setItem("flags-best-streak", String(state.bestStreak));
  } catch {}
}

function resetProgress() {
  state.progress = {};
  state.bestStreak = 0;
  state.correct = 0;
  state.wrong = 0;
  state.streak = 0;
  saveProgress();
}

// ============================================================
// Navigation
// ============================================================
function switchView(view) {
  state.currentView = view;
  document.querySelectorAll("nav button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("active", v.id === view + "-view");
  });

  if (view === "study") renderStudy();
  if (view === "progress") renderProgress();
}

document.querySelectorAll("nav button").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

// ============================================================
// Filters
// ============================================================
function renderFilters(containerId, selected, onChange) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  getContinents().forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (c === selected ? " active" : "");
    btn.textContent = c;
    btn.addEventListener("click", () => onChange(c));
    container.appendChild(btn);
  });
}

function setQuizContinent(c) {
  state.quizContinent = c;
  renderFilters("quiz-filters", c, setQuizContinent);
  newQuestion();
}

function setStudyContinent(c) {
  state.studyContinent = c;
  renderFilters("study-filters", c, setStudyContinent);
  renderStudy();
}

// ============================================================
// Quiz
// ============================================================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickOptions(answer, pool, count = 4) {
  const others = pool.filter((c) => c.code !== answer.code);
  const picked = shuffle(others).slice(0, count - 1);
  picked.push(answer);
  return shuffle(picked);
}

function newQuestion() {
  state.answered = false;
  const pool = getCountriesByContinent(state.quizContinent);
  if (pool.length < 4) return;

  const answer = pool[Math.floor(Math.random() * pool.length)];
  // Use the global pool for distractors so they're more challenging
  const options = pickOptions(answer, COUNTRIES, 4);

  state.currentQuestion = { answer, options };

  // Update DOM
  const flagImg = document.getElementById("quiz-flag");
  flagImg.src = getFlagUrl(answer.code, 640);
  flagImg.alt = "Flag quiz";

  const optContainer = document.getElementById("quiz-options");
  optContainer.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = opt.name;
    btn.addEventListener("click", () => handleAnswer(opt, btn));
    optContainer.appendChild(btn);
  });

  document.getElementById("result-text").textContent = "";
  document.getElementById("result-text").className = "result-text";
  document.getElementById("quiz-next").classList.remove("visible");
}

function handleAnswer(chosen, btnEl) {
  if (state.answered) return;
  state.answered = true;

  const correct = chosen.code === state.currentQuestion.answer.code;
  const answerCode = state.currentQuestion.answer.code;

  // Init progress entry
  if (!state.progress[answerCode]) {
    state.progress[answerCode] = { right: 0, wrong: 0 };
  }

  if (correct) {
    state.correct++;
    state.streak++;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;
    state.progress[answerCode].right++;
    btnEl.classList.add("correct-answer");
    document.getElementById("result-text").textContent = "Correct!";
    document.getElementById("result-text").className = "result-text correct";
  } else {
    state.wrong++;
    state.streak = 0;
    state.progress[answerCode].wrong++;
    btnEl.classList.add("wrong-answer");
    document.getElementById("result-text").textContent =
      `It was ${state.currentQuestion.answer.name}`;
    document.getElementById("result-text").className = "result-text wrong";

    // Highlight the correct answer
    document.querySelectorAll("#quiz-options .option-btn").forEach((b) => {
      if (b.textContent === state.currentQuestion.answer.name) {
        b.classList.add("correct-answer");
      }
    });
  }

  // Dim unselected wrong options
  document.querySelectorAll("#quiz-options .option-btn").forEach((b) => {
    if (!b.classList.contains("correct-answer") && !b.classList.contains("wrong-answer")) {
      b.classList.add("answered");
    }
  });

  updateScoreboard();
  saveProgress();

  document.getElementById("quiz-next").classList.add("visible");
}

function updateScoreboard() {
  document.getElementById("score-correct").textContent = state.correct;
  document.getElementById("score-wrong").textContent = state.wrong;
  document.getElementById("score-streak").textContent = state.streak;
  document.getElementById("score-best").textContent = state.bestStreak;
}

document.getElementById("next-btn").addEventListener("click", newQuestion);

// Keyboard shortcut: press any key 1-4 or Enter/Space to advance
document.addEventListener("keydown", (e) => {
  if (state.currentView !== "quiz") return;

  if (state.answered && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    newQuestion();
    return;
  }

  if (!state.answered && e.key >= "1" && e.key <= "4") {
    const btns = document.querySelectorAll("#quiz-options .option-btn");
    const idx = parseInt(e.key) - 1;
    if (btns[idx]) btns[idx].click();
  }
});

// ============================================================
// Study View
// ============================================================
function renderStudy() {
  const pool = getCountriesByContinent(state.studyContinent);
  const query = state.searchQuery.toLowerCase();
  const filtered = query
    ? pool.filter((c) => c.name.toLowerCase().includes(query))
    : pool;

  document.getElementById("study-count").textContent =
    `${filtered.length} ${filtered.length === 1 ? "country" : "countries"}`;

  const grid = document.getElementById("flag-grid");
  grid.innerHTML = "";
  filtered.forEach((country) => {
    const card = document.createElement("div");
    card.className = "flag-card";
    card.innerHTML = `
      <img src="${getFlagUrl(country.code, 320)}" alt="${country.name}" loading="lazy" />
      <div class="flag-card-name">${country.name}</div>
    `;
    card.addEventListener("click", () => openModal(country));
    grid.appendChild(card);
  });
}

document.getElementById("search-input").addEventListener("input", (e) => {
  state.searchQuery = e.target.value;
  renderStudy();
});

// ============================================================
// Modal
// ============================================================
function openModal(country) {
  document.getElementById("modal-flag").src = getFlagUrl(country.code, 640);
  document.getElementById("modal-name").textContent = country.name;
  document.getElementById("modal-continent").textContent = country.continent;
  document.getElementById("modal-overlay").classList.add("open");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
}

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// ============================================================
// Progress View
// ============================================================
function getMasteredCountries() {
  return COUNTRIES.filter((c) => {
    const p = state.progress[c.code];
    return p && p.right >= MASTERY_THRESHOLD;
  });
}

function renderProgress() {
  // Overall stats
  let totalRight = 0;
  let totalWrong = 0;
  Object.values(state.progress).forEach((p) => {
    totalRight += p.right;
    totalWrong += p.wrong;
  });
  const totalAnswered = totalRight + totalWrong;
  const accuracy = totalAnswered > 0 ? Math.round((totalRight / totalAnswered) * 100) : 0;
  const mastered = getMasteredCountries();

  document.getElementById("total-answered").textContent = totalAnswered;
  document.getElementById("total-accuracy").textContent = accuracy + "%";
  document.getElementById("total-mastered").textContent = mastered.length;

  // Continent progress
  const continentDiv = document.getElementById("continent-progress");
  continentDiv.innerHTML = "";
  const continents = getContinents().filter((c) => c !== "All");
  continents.forEach((cont) => {
    const countries = getCountriesByContinent(cont);
    const masteredInCont = countries.filter((c) => {
      const p = state.progress[c.code];
      return p && p.right >= MASTERY_THRESHOLD;
    });
    const pct = Math.round((masteredInCont.length / countries.length) * 100);

    const wrapper = document.createElement("div");
    wrapper.className = "progress-bar-container";
    wrapper.innerHTML = `
      <div class="progress-bar-label">
        <span>${cont}</span>
        <span>${masteredInCont.length} / ${countries.length}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-bar-fill green" style="width:${pct}%"></div>
      </div>
    `;
    continentDiv.appendChild(wrapper);
  });

  // Mastered list
  const masteredListEl = document.getElementById("mastered-list");
  masteredListEl.innerHTML = "";
  if (mastered.length === 0) {
    masteredListEl.innerHTML = '<div class="empty-msg">No flags mastered yet. Keep practicing!</div>';
  } else {
    mastered.forEach((c) => {
      const tag = document.createElement("span");
      tag.className = "mastered-tag";
      tag.innerHTML = `<img src="${getFlagUrl(c.code, 40)}" alt="" /> ${c.name}`;
      masteredListEl.appendChild(tag);
    });
  }
}

document.getElementById("reset-btn").addEventListener("click", () => {
  if (confirm("Reset all progress? This cannot be undone.")) {
    resetProgress();
    updateScoreboard();
    renderProgress();
  }
});

// ============================================================
// Init
// ============================================================
loadProgress();
updateScoreboard();
renderFilters("quiz-filters", state.quizContinent, setQuizContinent);
renderFilters("study-filters", state.studyContinent, setStudyContinent);
newQuestion();
