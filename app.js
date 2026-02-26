// ============================================================
// State
// ============================================================
const MASTERY_THRESHOLD = 3;

const DIFFICULTIES = {
  easy: { label: "Easy", options: 4, detail: "4 options" },
  medium: { label: "Medium", options: 8, detail: "8 options" },
  hard: { label: "Hard", options: 12, detail: "12 options" },
  beast: { label: "Beast", options: 0, detail: "Type it" },
};

let state = {
  currentView: "quiz",
  quizContinent: "All",
  studyContinent: "All",
  searchQuery: "",
  difficulty: "easy",
  // Quiz session (per-difficulty)
  correct: 0,
  wrong: 0,
  streak: 0,
  bestStreak: 0,
  currentQuestion: null,
  answered: false,
  // Persistent best streaks per difficulty
  bestStreaks: { easy: 0, medium: 0, hard: 0, beast: 0 },
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
    // Load per-difficulty best streaks
    const streaks = localStorage.getItem("flags-best-streaks");
    if (streaks) {
      state.bestStreaks = JSON.parse(streaks);
    }
    // Migrate old single best streak to easy mode
    if (!streaks) {
      const old = localStorage.getItem("flags-best-streak");
      if (old) {
        state.bestStreaks.easy = parseInt(old, 10) || 0;
        localStorage.removeItem("flags-best-streak");
      }
    }
    state.bestStreak = state.bestStreaks[state.difficulty] || 0;
  } catch {}
}

function saveProgress() {
  try {
    localStorage.setItem("flags-progress", JSON.stringify(state.progress));
    state.bestStreaks[state.difficulty] = state.bestStreak;
    localStorage.setItem("flags-best-streaks", JSON.stringify(state.bestStreaks));
  } catch {}
}

function resetProgress() {
  state.progress = {};
  state.bestStreaks = { easy: 0, medium: 0, hard: 0, beast: 0 };
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
  // If leaving quiz, end the current session
  if (state.currentView === "quiz" && view !== "quiz") {
    endQuizSession();
  }

  state.currentView = view;
  document.querySelectorAll("nav button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("active", v.id === view + "-view");
  });

  if (view === "quiz") newQuestion();
  if (view === "study") renderStudy();
  if (view === "progress") renderProgress();
}

function endQuizSession() {
  // Save best streak, then reset all session stats
  state.bestStreaks[state.difficulty] = state.bestStreak;
  saveProgress();
  state.correct = 0;
  state.wrong = 0;
  state.streak = 0;
  updateScoreboard();
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

// ============================================================
// Difficulty
// ============================================================
function renderDifficulty() {
  const container = document.getElementById("difficulty-selector");
  container.innerHTML = "";
  Object.entries(DIFFICULTIES).forEach(([key, diff]) => {
    const btn = document.createElement("button");
    btn.className = "diff-btn" + (key === state.difficulty ? " active" : "");
    btn.innerHTML = `${diff.label}<span class="diff-detail">${diff.detail}</span>`;
    btn.addEventListener("click", () => setDifficulty(key));
    container.appendChild(btn);
  });
}

function setDifficulty(key) {
  if (key === state.difficulty) return;
  // Save current best streak before switching
  state.bestStreaks[state.difficulty] = state.bestStreak;
  saveProgress();

  state.difficulty = key;
  // Persist to URL hash
  window.location.hash = key;
  // Reset session stats for new difficulty
  state.correct = 0;
  state.wrong = 0;
  state.streak = 0;
  // Load best streak for new difficulty
  state.bestStreak = state.bestStreaks[key] || 0;

  renderDifficulty();
  updateScoreboard();
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
  const diff = DIFFICULTIES[state.difficulty];
  const optionCount = diff.options;
  const pool = getCountriesByContinent(state.quizContinent);
  if (pool.length < 2) return;

  const answer = pool[Math.floor(Math.random() * pool.length)];

  state.currentQuestion = { answer, options: [] };

  // Update flag image + blurred background
  const flagImg = document.getElementById("quiz-flag");
  const flagDisplay = document.querySelector(".flag-display");
  const flagUrl = getFlagUrl(answer.code);
  flagImg.src = flagUrl;
  flagImg.alt = "Flag quiz";
  flagDisplay.style.setProperty("--flag-url", `url(${flagUrl})`);

  const optContainer = document.getElementById("quiz-options");
  optContainer.innerHTML = "";

  if (state.difficulty === "beast") {
    // Beast mode: autocomplete text input
    optContainer.className = "options beast";
    renderBeastInput(optContainer);
  } else {
    // Multiple choice modes
    const options = pickOptions(answer, COUNTRIES, optionCount);
    state.currentQuestion.options = options;

    // Grid columns: 3 for 6/12, 4 for 8, 2 for 4
    let colClass = "";
    if (optionCount === 8) colClass = " cols-4";
    else if (optionCount === 6 || optionCount === 12) colClass = " cols-3";
    optContainer.className = "options" + colClass;

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.textContent = opt.name;
      btn.addEventListener("click", () => handleAnswer(opt, btn));
      optContainer.appendChild(btn);
    });
  }

  document.getElementById("result-text").textContent = "";
  document.getElementById("result-text").className = "result-text";
  document.getElementById("quiz-next").classList.remove("visible");
}

// ============================================================
// Beast Mode Autocomplete
// ============================================================
function renderBeastInput(container) {
  const wrap = document.createElement("div");
  wrap.className = "beast-input-wrap";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "beast-input";
  input.id = "beast-input";
  input.placeholder = "Type the country name...";
  input.autocomplete = "off";

  const dropdown = document.createElement("div");
  dropdown.className = "beast-dropdown";
  dropdown.id = "beast-dropdown";

  wrap.appendChild(input);
  wrap.appendChild(dropdown);
  container.appendChild(wrap);

  let highlightIdx = -1;
  let filtered = [];

  function updateDropdown() {
    const query = input.value.trim().toLowerCase();
    dropdown.innerHTML = "";
    highlightIdx = -1;

    if (query.length === 0) {
      dropdown.classList.remove("open");
      return;
    }

    // Filter: starts-with first, then contains
    const startsWith = COUNTRIES.filter(
      (c) => c.name.toLowerCase().startsWith(query)
    );
    const contains = COUNTRIES.filter(
      (c) =>
        !c.name.toLowerCase().startsWith(query) &&
        c.name.toLowerCase().includes(query)
    );
    filtered = [...startsWith, ...contains].slice(0, 8);

    if (filtered.length === 0) {
      dropdown.classList.remove("open");
      return;
    }

    filtered.forEach((country, idx) => {
      const opt = document.createElement("div");
      opt.className = "beast-option";
      // Highlight the matching part
      const name = country.name;
      const matchStart = name.toLowerCase().indexOf(query);
      if (matchStart >= 0) {
        opt.innerHTML =
          escapeHtml(name.substring(0, matchStart)) +
          '<span class="match-highlight">' +
          escapeHtml(name.substring(matchStart, matchStart + query.length)) +
          "</span>" +
          escapeHtml(name.substring(matchStart + query.length));
      } else {
        opt.textContent = name;
      }
      opt.addEventListener("mousedown", (e) => {
        e.preventDefault(); // prevent blur
        selectBeastAnswer(country);
      });
      opt.addEventListener("mouseenter", () => {
        highlightIdx = idx;
        updateHighlight();
      });
      dropdown.appendChild(opt);
    });

    dropdown.classList.add("open");
  }

  function updateHighlight() {
    dropdown.querySelectorAll(".beast-option").forEach((el, i) => {
      el.classList.toggle("highlighted", i === highlightIdx);
    });
  }

  input.addEventListener("input", updateDropdown);

  input.addEventListener("keydown", (e) => {
    if (!dropdown.classList.contains("open") && e.key !== "Enter") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightIdx = Math.min(highlightIdx + 1, filtered.length - 1);
      updateHighlight();
      // Scroll highlighted into view
      const highlighted = dropdown.querySelector(".highlighted");
      if (highlighted) highlighted.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, 0);
      updateHighlight();
      const highlighted = dropdown.querySelector(".highlighted");
      if (highlighted) highlighted.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (highlightIdx >= 0 && highlightIdx < filtered.length) {
        selectBeastAnswer(filtered[highlightIdx]);
      }
    } else if (e.key === "Escape") {
      dropdown.classList.remove("open");
    }
  });

  input.addEventListener("blur", () => {
    // Small delay to allow click events on dropdown
    setTimeout(() => dropdown.classList.remove("open"), 150);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim().length > 0 && filtered.length > 0 && !state.answered) {
      dropdown.classList.add("open");
    }
  });

  // Auto-focus
  setTimeout(() => input.focus(), 50);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function selectBeastAnswer(country) {
  if (state.answered) return;
  state.answered = true;

  const input = document.getElementById("beast-input");
  const dropdown = document.getElementById("beast-dropdown");
  const correct = country.code === state.currentQuestion.answer.code;
  const answerCode = state.currentQuestion.answer.code;
  const prevBest = state.bestStreak;

  input.value = country.name;
  input.disabled = true;
  dropdown.classList.remove("open");

  // Init progress entry
  if (!state.progress[answerCode]) {
    state.progress[answerCode] = { right: 0, wrong: 0 };
  }

  if (correct) {
    state.correct++;
    state.streak++;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;
    state.progress[answerCode].right++;
    input.classList.add("correct-answer");
    document.getElementById("result-text").textContent = "Correct!";
    document.getElementById("result-text").className = "result-text correct";
    if (state.bestStreak > prevBest) triggerCelebration(state.bestStreak);
  } else {
    state.wrong++;
    state.streak = 0;
    state.progress[answerCode].wrong++;
    input.classList.add("wrong-answer");
    document.getElementById("result-text").textContent =
      `It was ${state.currentQuestion.answer.name}`;
    document.getElementById("result-text").className = "result-text wrong";
  }

  updateScoreboard();
  saveProgress();
  document.getElementById("quiz-next").classList.add("visible");
}

function handleAnswer(chosen, btnEl) {
  if (state.answered) return;
  state.answered = true;

  const correct = chosen.code === state.currentQuestion.answer.code;
  const answerCode = state.currentQuestion.answer.code;
  const prevBest = state.bestStreak;

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
    if (state.bestStreak > prevBest) triggerCelebration(state.bestStreak);
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

// ============================================================
// Streak Celebration
// ============================================================
const CONFETTI_COLORS = ["#eab308", "#22c55e", "#3b82f6", "#ef4444", "#a855f7", "#f97316"];

function triggerCelebration(streakNum) {
  // Confetti burst
  const container = document.createElement("div");
  container.className = "celebration-container";
  document.body.appendChild(container);

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  for (let i = 0; i < 40; i++) {
    const particle = document.createElement("div");
    particle.className = "confetti-particle";
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    particle.style.background = color;
    particle.style.left = cx + "px";
    particle.style.top = cy + "px";

    const angle = (Math.PI * 2 * i) / 40 + (Math.random() - 0.5) * 0.5;
    const dist = 120 + Math.random() * 200;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 60;
    const rot = (Math.random() - 0.5) * 720;

    particle.style.setProperty("--dx", dx + "px");
    particle.style.setProperty("--dy", dy + "px");
    particle.style.setProperty("--rot", rot + "deg");
    particle.style.width = (6 + Math.random() * 6) + "px";
    particle.style.height = (6 + Math.random() * 6) + "px";
    particle.style.animationDelay = (Math.random() * 0.15) + "s";

    container.appendChild(particle);
  }

  // Banner
  const banner = document.createElement("div");
  banner.className = "new-best-banner";
  banner.textContent = `New Best Streak: ${streakNum}!`;
  document.body.appendChild(banner);

  // Cleanup
  setTimeout(() => {
    container.remove();
    banner.remove();
  }, 1600);
}

document.getElementById("next-btn").addEventListener("click", newQuestion);

// Keyboard shortcut: press number keys or Enter/Space to advance
document.addEventListener("keydown", (e) => {
  if (state.currentView !== "quiz") return;

  // In beast mode, let the input handle its own keys
  if (state.difficulty === "beast" && !state.answered) return;

  if (state.answered && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    newQuestion();
    return;
  }

  const maxKey = DIFFICULTIES[state.difficulty].options;
  if (!state.answered && maxKey > 0 && e.key >= "1" && e.key <= String(Math.min(maxKey, 9))) {
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
    const flagUrl = getFlagUrl(country.code);
    const card = document.createElement("div");
    card.className = "flag-card";
    card.innerHTML = `
      <div class="flag-card-img" style="--flag-url: url(${flagUrl})">
        <img src="${flagUrl}" alt="${country.name}" loading="lazy" />
      </div>
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
  const flagUrl = getFlagUrl(country.code);
  document.getElementById("modal-flag").src = flagUrl;
  document.getElementById("modal-flag-wrap").style.setProperty("--flag-url", `url(${flagUrl})`);
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
      tag.innerHTML = `<img src="${getFlagUrl(c.code)}" alt="" /> ${c.name}`;
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

// Restore difficulty from URL hash
function getDifficultyFromHash() {
  const hash = window.location.hash.replace("#", "").toLowerCase();
  return DIFFICULTIES[hash] ? hash : null;
}

const hashDifficulty = getDifficultyFromHash();
if (hashDifficulty) {
  state.difficulty = hashDifficulty;
}

// Sync difficulty when user navigates with back/forward
window.addEventListener("hashchange", () => {
  const d = getDifficultyFromHash();
  if (d && d !== state.difficulty) setDifficulty(d);
});

loadProgress();
updateScoreboard();
renderDifficulty();
renderFilters("quiz-filters", state.quizContinent, setQuizContinent);
renderFilters("study-filters", state.studyContinent, setStudyContinent);
newQuestion();
