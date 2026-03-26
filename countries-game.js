// ============================================================
// Countries Game - Find countries on the map
// ============================================================
const CountriesGame = (() => {
  const MASTERY_THRESHOLD = 3;

  const DIFFICULTIES = {
    easy:   { label: "Easy",   options: 4,  detail: "4 options" },
    medium: { label: "Medium", options: 8,  detail: "8 options" },
    hard:   { label: "Hard",   options: 12, detail: "12 options" },
    beast:  { label: "Beast",  options: 0,  detail: "Type it" },
  };

  const CONTINENT_BOUNDS = {
    "All":           [[-60, -180], [80, 180]],
    "Africa":        [[-35, -20], [38, 55]],
    "Asia":          [[0, 25], [55, 150]],
    "Europe":        [[35, -12], [72, 45]],
    "North America": [[5, -170], [75, -50]],
    "South America": [[-56, -82], [13, -34]],
    "Oceania":       [[-50, 110], [10, 180]],
  };

  // ISO 3166-1 numeric -> alpha-2 mapping for GeoJSON matching
  const NUM_TO_A2 = {
    "004":"af","008":"al","012":"dz","020":"ad","024":"ao","028":"ag",
    "031":"az","032":"ar","036":"au","040":"at","044":"bs","048":"bh",
    "050":"bd","051":"am","052":"bb","056":"be","064":"bt","068":"bo",
    "070":"ba","072":"bw","076":"br","084":"bz","090":"sb","096":"bn",
    "100":"bg","104":"mm","108":"bi","112":"by","116":"kh","120":"cm",
    "124":"ca","132":"cv","140":"cf","144":"lk","148":"td","152":"cl",
    "156":"cn","170":"co","174":"km","178":"cg","180":"cd","188":"cr",
    "191":"hr","192":"cu","196":"cy","203":"cz","208":"dk","212":"dm",
    "214":"do","218":"ec","222":"sv","226":"gq","231":"et","232":"er",
    "233":"ee","242":"fj","246":"fi","250":"fr","262":"dj","266":"ga",
    "268":"ge","270":"gm","275":"ps","276":"de","288":"gh","296":"ki",
    "300":"gr","308":"gd","320":"gt","324":"gn","328":"gy","332":"ht",
    "336":"va","340":"hn","348":"hu","352":"is","356":"in","360":"id",
    "364":"ir","368":"iq","372":"ie","376":"il","380":"it","384":"ci",
    "388":"jm","392":"jp","398":"kz","400":"jo","404":"ke","408":"kp",
    "410":"kr","414":"kw","417":"kg","418":"la","422":"lb","426":"ls",
    "428":"lv","430":"lr","434":"ly","438":"li","440":"lt","442":"lu",
    "450":"mg","454":"mw","458":"my","462":"mv","466":"ml","470":"mt",
    "478":"mr","480":"mu","484":"mx","492":"mc","496":"mn","498":"md",
    "499":"me","504":"ma","508":"mz","512":"om","516":"na","520":"nr",
    "524":"np","528":"nl","548":"vu","554":"nz","558":"ni","562":"ne",
    "566":"ng","578":"no","583":"fm","584":"mh","585":"pw","586":"pk",
    "591":"pa","598":"pg","600":"py","604":"pe","608":"ph","616":"pl",
    "620":"pt","624":"gw","626":"tl","634":"qa","642":"ro","643":"ru",
    "646":"rw","659":"kn","662":"lc","670":"vc","674":"sm","678":"st",
    "682":"sa","686":"sn","688":"rs","690":"sc","694":"sl","702":"sg",
    "703":"sk","704":"vn","705":"si","706":"so","710":"za","716":"zw",
    "724":"es","728":"ss","729":"sd","740":"sr","748":"sz","752":"se",
    "756":"ch","760":"sy","762":"tj","764":"th","768":"tg","776":"to",
    "780":"tt","784":"ae","788":"tn","792":"tr","795":"tm","798":"tv",
    "800":"ug","804":"ua","807":"mk","818":"eg","826":"gb","834":"tz",
    "840":"us","854":"bf","858":"uy","860":"uz","862":"ve","882":"ws",
    "887":"ye","894":"zm",
    "204":"bj","-99":"xk","158":"tw",
  };

  // Map state
  let quizMap = null;
  let studyMap = null;
  let geoLayer = null;
  let studyGeoLayer = null;
  let featuresByCode = {};
  let studyFeaturesByCode = {};
  let availableCountries = [];
  let initialized = false;
  let studyHighlighted = null;
  let geoJsonData = null;

  // Game state
  let state = {
    view: "quiz",
    continent: "All",
    difficulty: "easy",
    correct: 0,
    wrong: 0,
    streak: 0,
    bestStreak: 0,
    celebratedNewBest: false,
    currentQuestion: null,
    answered: false,
    bestStreaks: { easy: 0, medium: 0, hard: 0, beast: 0 },
    progress: {},
    studyContinent: "All",
  };

  // Styles
  const S_DEFAULT   = { fillColor: "#1e3a5f", fillOpacity: 0.4, color: "#2d5a88", weight: 1 };
  const S_HIGHLIGHT = { fillColor: "#3b82f6", fillOpacity: 0.8, color: "#93c5fd", weight: 2.5 };
  const S_CORRECT   = { fillColor: "#22c55e", fillOpacity: 0.7, color: "#86efac", weight: 2.5 };
  const S_WRONG     = { fillColor: "#ef4444", fillOpacity: 0.7, color: "#fca5a5", weight: 2.5 };
  const S_HOVER     = { fillColor: "#334155", fillOpacity: 0.6, color: "#64748b", weight: 1.5 };

  // ============================================================
  // Lazy Loading
  // ============================================================
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function loadCSS(href) {
    return new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = resolve;
      document.head.appendChild(link);
    });
  }

  // ============================================================
  // GeoJSON Post-Processing
  // ============================================================
  // The world-atlas TopoJSON has duplicate IDs (e.g. Australia "036"
  // appears twice: mainland + Ashmore & Cartier Islands) and some
  // features with undefined IDs (e.g. Kosovo). This function merges
  // duplicates into single MultiPolygon features and assigns IDs to
  // known undefined-ID features by matching their topology name.
  const NAME_TO_NUM = { "Kosovo": "-99" };

  function fixFeatures(geojson) {
    // Assign IDs to known features that have undefined IDs
    geojson.features.forEach(f => {
      if (f.id === undefined && f.properties && NAME_TO_NUM[f.properties.name]) {
        f.id = NAME_TO_NUM[f.properties.name];
      }
    });

    // Merge features that share the same ID
    const byId = {};
    const order = [];
    geojson.features.forEach(f => {
      const id = String(f.id);
      if (!byId[id]) {
        byId[id] = f;
        order.push(id);
      } else {
        // Merge geometry into the existing feature
        const existing = byId[id];
        const toPolygons = geom => {
          if (geom.type === "MultiPolygon") return geom.coordinates;
          if (geom.type === "Polygon") return [geom.coordinates];
          return [];
        };
        const merged = [...toPolygons(existing.geometry), ...toPolygons(f.geometry)];
        existing.geometry = { type: "MultiPolygon", coordinates: merged };
      }
    });
    geojson.features = order.map(id => byId[id]);
    return geojson;
  }

  // ============================================================
  // Antimeridian Fix
  // ============================================================
  // Countries like Russia, Fiji, and Kiribati have polygons that
  // cross the 180° meridian. Leaflet draws these "the wrong way"
  // as a band across the entire map. Fix by normalizing coordinates
  // so no single ring crosses the antimeridian.
  function fixAntimeridian(geojson) {
    geojson.features.forEach(feature => {
      const geom = feature.geometry;
      if (geom.type === "Polygon") {
        geom.coordinates = fixPolygonRings(geom.coordinates);
      } else if (geom.type === "MultiPolygon") {
        geom.coordinates = geom.coordinates.map(poly => fixPolygonRings(poly));
      }
    });
    return geojson;
  }

  function fixPolygonRings(rings) {
    return rings.map(ring => {
      let minLng = Infinity, maxLng = -Infinity;
      for (let i = 0; i < ring.length; i++) {
        if (ring[i][0] < minLng) minLng = ring[i][0];
        if (ring[i][0] > maxLng) maxLng = ring[i][0];
      }
      // If the ring spans more than 180° of longitude, it crosses the antimeridian
      if (maxLng - minLng > 180) {
        return ring.map(c => c[0] < 0 ? [c[0] + 360, c[1]] : [c[0], c[1]]);
      }
      return ring;
    });
  }

  // ============================================================
  // Persistence
  // ============================================================
  function loadProgress() {
    try {
      const saved = localStorage.getItem("countries-progress");
      if (saved) state.progress = JSON.parse(saved);
      const streaks = localStorage.getItem("countries-best-streaks");
      if (streaks) state.bestStreaks = JSON.parse(streaks);
      state.bestStreak = state.bestStreaks[state.difficulty] || 0;
    } catch {}
  }

  function saveProgress() {
    try {
      localStorage.setItem("countries-progress", JSON.stringify(state.progress));
      state.bestStreaks[state.difficulty] = state.bestStreak;
      localStorage.setItem("countries-best-streaks", JSON.stringify(state.bestStreaks));
    } catch {}
  }

  function resetAllProgress() {
    state.progress = {};
    state.bestStreaks = { easy: 0, medium: 0, hard: 0, beast: 0 };
    state.bestStreak = 0;
    state.correct = 0;
    state.wrong = 0;
    state.streak = 0;
    saveProgress();
  }

  // ============================================================
  // Map Initialization
  // ============================================================
  function createMap(containerId) {
    const m = L.map(containerId, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 8,
      zoomControl: true,
      attributionControl: false,
      worldCopyJump: true,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(m);
    return m;
  }

  async function init() {
    if (initialized) {
      onViewSwitch(state.view);
      return;
    }

    const loading = document.getElementById("countries-loading");
    if (loading) loading.style.display = "flex";

    try {
      // Lazy-load libraries and GeoJSON in parallel
      const [, , , topoResp] = await Promise.all([
        window.L ? null : loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"),
        window.L ? null : loadCSS("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"),
        window.topojson ? null : loadScript("https://cdn.jsdelivr.net/npm/topojson-client@3"),
        fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"),
      ]);

      const topology = await topoResp.json();
      geoJsonData = topojson.feature(topology, topology.objects.countries);
      fixFeatures(geoJsonData);
      fixAntimeridian(geoJsonData);

      // Create quiz map
      quizMap = createMap("countries-quiz-map");
      geoLayer = L.geoJSON(geoJsonData, {
        style: S_DEFAULT,
        onEachFeature: (feature, layer) => {
          const a2 = NUM_TO_A2[feature.id];
          if (a2 && COUNTRIES.find(c => c.code === a2)) {
            featuresByCode[a2] = layer;
            layer._code = a2;
          }
        },
      }).addTo(quizMap);

      // Create study map
      studyMap = createMap("countries-study-map");
      studyGeoLayer = L.geoJSON(geoJsonData, {
        style: S_DEFAULT,
        onEachFeature: (feature, layer) => {
          const a2 = NUM_TO_A2[feature.id];
          const country = a2 && COUNTRIES.find(c => c.code === a2);
          if (country) {
            layer._code = a2;
            studyFeaturesByCode[a2] = layer;
            layer.on("mouseover", () => {
              layer.setStyle(S_HOVER);
              layer.bringToFront();
            });
            layer.on("mouseout", () => {
              if (studyHighlighted !== layer) {
                studyGeoLayer.resetStyle(layer);
              }
            });
            layer.on("click", () => {
              // Reset previous highlight
              if (studyHighlighted && studyHighlighted !== layer) {
                studyGeoLayer.resetStyle(studyHighlighted);
              }
              layer.setStyle(S_HIGHLIGHT);
              studyHighlighted = layer;
              layer.bringToFront();
              studyMap.fitBounds(layer.getBounds().pad(0.3), { maxZoom: 7 });
              layer.unbindPopup();
              layer.bindPopup(`
                <div style="text-align:center;min-width:120px">
                  <img src="${getFlagUrl(country.code)}" style="width:48px;height:32px;object-fit:contain;margin-bottom:6px;border-radius:2px" />
                  <div style="font-weight:600;font-size:0.95rem">${country.name}</div>
                  <div style="font-size:0.8rem;opacity:0.7">${country.continent}</div>
                </div>
              `).openPopup();
            });
          }
        },
      }).addTo(studyMap);

      availableCountries = COUNTRIES.filter(c => featuresByCode[c.code]);

      initialized = true;
      if (loading) loading.style.display = "none";

      loadProgress();
      renderDifficulty();
      renderFilters("countries-quiz-filters", state.continent, setQuizContinent);
      renderFilters("countries-study-filters", state.studyContinent, setStudyContinent);
      updateScoreboard();

      // Update available count
      const countEl = document.getElementById("countries-map-count");
      if (countEl) countEl.textContent = `${availableCountries.length} of ${COUNTRIES.length} countries on map`;

      newQuestion();
    } catch (err) {
      console.error("Countries game init failed:", err);
      if (loading) {
        loading.innerHTML = '<div style="color:var(--wrong);text-align:center">Failed to load map data.<br>Check your connection and refresh.</div>';
      }
    }
  }

  // ============================================================
  // Filters
  // ============================================================
  function renderFilters(containerId, selected, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    getContinents().forEach(c => {
      const btn = document.createElement("button");
      btn.className = "filter-btn" + (c === selected ? " active" : "");
      btn.textContent = c;
      btn.addEventListener("click", () => onChange(c));
      container.appendChild(btn);
    });
  }

  function setQuizContinent(c) {
    state.continent = c;
    renderFilters("countries-quiz-filters", c, setQuizContinent);
    newQuestion();
  }

  function setStudyContinent(c) {
    state.studyContinent = c;
    renderFilters("countries-study-filters", c, setStudyContinent);
    if (studyMap) {
      const bounds = CONTINENT_BOUNDS[c];
      if (bounds) studyMap.fitBounds(bounds, { animate: true, duration: 0.5 });
    }
  }

  // ============================================================
  // Difficulty
  // ============================================================
  function renderDifficulty() {
    const container = document.getElementById("countries-difficulty-selector");
    if (!container) return;
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
    state.bestStreaks[state.difficulty] = state.bestStreak;
    saveProgress();
    state.difficulty = key;
    state.correct = 0;
    state.wrong = 0;
    state.streak = 0;
    state.celebratedNewBest = false;
    state.bestStreak = state.bestStreaks[key] || 0;
    renderDifficulty();
    updateScoreboard();
    newQuestion();
  }

  // ============================================================
  // Quiz
  // ============================================================
  function getFilteredCountries() {
    return state.continent === "All"
      ? availableCountries
      : availableCountries.filter(c => c.continent === state.continent);
  }

  function pickOptions(answer, pool, count) {
    const others = pool.filter(c => c.code !== answer.code);
    const picked = shuffle(others).slice(0, count - 1);
    picked.push(answer);
    return shuffle(picked);
  }

  function resetStyles() {
    if (geoLayer) {
      geoLayer.eachLayer(l => l.setStyle(S_DEFAULT));
    }
  }

  function newQuestion() {
    if (!initialized || !quizMap) return;
    state.answered = false;

    const pool = getFilteredCountries();
    if (pool.length < 2) return;

    const prevCode = state.currentQuestion?.answer?.code;
    const eligible = pool.length > 1 && prevCode
      ? pool.filter(c => c.code !== prevCode)
      : pool;
    const answer = eligible[Math.floor(Math.random() * eligible.length)];

    resetStyles();

    // Highlight target country on map
    const targetLayer = featuresByCode[answer.code];
    if (targetLayer) {
      targetLayer.setStyle(S_HIGHLIGHT);
      targetLayer.bringToFront();

      // Zoom varies by difficulty — extra padding shows surrounding countries for context
      let padAmount = 2.0, maxZoom = 5;
      if (state.difficulty === "easy") { padAmount = 1.0; maxZoom = 6; }
      else if (state.difficulty === "hard" || state.difficulty === "beast") { padAmount = 3.0; maxZoom = 4; }

      quizMap.fitBounds(targetLayer.getBounds().pad(padAmount), {
        maxZoom,
        animate: true,
        duration: 0.5,
      });
    }

    state.currentQuestion = { answer, options: [] };

    const optContainer = document.getElementById("countries-quiz-options");
    optContainer.innerHTML = "";

    if (state.difficulty === "beast") {
      optContainer.className = "options beast";
      renderBeastInput(optContainer);
    } else {
      const optionCount = DIFFICULTIES[state.difficulty].options;
      const options = pickOptions(answer, availableCountries, optionCount);
      state.currentQuestion.options = options;

      let colClass = "";
      if (optionCount === 8) colClass = " cols-4";
      else if (optionCount === 12) colClass = " cols-3";
      optContainer.className = "options" + colClass;

      options.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.textContent = opt.name;
        btn.addEventListener("click", () => handleAnswer(opt, btn));
        optContainer.appendChild(btn);
      });
    }

    document.getElementById("countries-result-text").textContent = "";
    document.getElementById("countries-result-text").className = "result-text";
    document.getElementById("countries-quiz-next").classList.remove("visible");
  }

  function handleAnswer(chosen, btnEl) {
    if (state.answered) return;
    state.answered = true;

    const correct = chosen.code === state.currentQuestion.answer.code;
    const answerCode = state.currentQuestion.answer.code;

    if (!state.progress[answerCode]) {
      state.progress[answerCode] = { right: 0, wrong: 0 };
    }

    const targetLayer = featuresByCode[answerCode];

    if (correct) {
      state.correct++;
      state.streak++;
      if (state.streak > state.bestStreak) state.bestStreak = state.streak;
      state.progress[answerCode].right++;
      btnEl.classList.add("correct-answer");
      if (targetLayer) targetLayer.setStyle(S_CORRECT);
      document.getElementById("countries-result-text").textContent = "Correct!";
      document.getElementById("countries-result-text").className = "result-text correct";
      if (!state.celebratedNewBest && state.streak > (state.bestStreaks[state.difficulty] || 0)) {
        state.celebratedNewBest = true;
        triggerCelebration(state.bestStreak);
      }
    } else {
      state.wrong++;
      state.streak = 0;
      state.celebratedNewBest = false;
      state.progress[answerCode].wrong++;
      btnEl.classList.add("wrong-answer");
      if (targetLayer) targetLayer.setStyle(S_CORRECT);
      const wrongLayer = featuresByCode[chosen.code];
      if (wrongLayer) wrongLayer.setStyle(S_WRONG);
      document.getElementById("countries-result-text").textContent =
        `It was ${state.currentQuestion.answer.name}`;
      document.getElementById("countries-result-text").className = "result-text wrong";
      document.querySelectorAll("#countries-quiz-options .option-btn").forEach(b => {
        if (b.textContent === state.currentQuestion.answer.name) {
          b.classList.add("correct-answer");
        }
      });
    }

    document.querySelectorAll("#countries-quiz-options .option-btn").forEach(b => {
      if (!b.classList.contains("correct-answer") && !b.classList.contains("wrong-answer")) {
        b.classList.add("answered");
      }
    });

    updateScoreboard();
    saveProgress();
    document.getElementById("countries-quiz-next").classList.add("visible");
  }

  // ============================================================
  // Beast Mode
  // ============================================================
  function renderBeastInput(container) {
    const wrap = document.createElement("div");
    wrap.className = "beast-input-wrap";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "beast-input";
    input.id = "countries-beast-input";
    input.placeholder = "Type the country name...";
    input.autocomplete = "off";

    const dropdown = document.createElement("div");
    dropdown.className = "beast-dropdown";
    dropdown.id = "countries-beast-dropdown";

    wrap.appendChild(input);
    wrap.appendChild(dropdown);
    container.appendChild(wrap);

    let highlightIdx = -1;
    let filtered = [];

    function updateDropdown() {
      const query = input.value.trim().toLowerCase();
      dropdown.innerHTML = "";
      highlightIdx = -1;
      if (query.length === 0) { dropdown.classList.remove("open"); return; }

      const startsWith = availableCountries.filter(c => c.name.toLowerCase().startsWith(query));
      const contains = availableCountries.filter(
        c => !c.name.toLowerCase().startsWith(query) && c.name.toLowerCase().includes(query)
      );
      filtered = [...startsWith, ...contains].slice(0, 8);
      if (filtered.length === 0) { dropdown.classList.remove("open"); return; }

      filtered.forEach((country, idx) => {
        const opt = document.createElement("div");
        opt.className = "beast-option";
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
        opt.addEventListener("mousedown", e => { e.preventDefault(); selectBeastAnswer(country); });
        opt.addEventListener("mouseenter", () => { highlightIdx = idx; updateHighlight(); });
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
    input.addEventListener("keydown", e => {
      if (!dropdown.classList.contains("open") && e.key !== "Enter") return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        highlightIdx = Math.min(highlightIdx + 1, filtered.length - 1);
        updateHighlight();
        const h = dropdown.querySelector(".highlighted");
        if (h) h.scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        highlightIdx = Math.max(highlightIdx - 1, 0);
        updateHighlight();
        const h = dropdown.querySelector(".highlighted");
        if (h) h.scrollIntoView({ block: "nearest" });
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
      setTimeout(() => dropdown.classList.remove("open"), 150);
    });
    input.addEventListener("focus", () => {
      if (input.value.trim().length > 0 && filtered.length > 0 && !state.answered) {
        dropdown.classList.add("open");
      }
    });
    setTimeout(() => input.focus(), 50);
  }

  function selectBeastAnswer(country) {
    if (state.answered) return;
    state.answered = true;

    const input = document.getElementById("countries-beast-input");
    const dropdown = document.getElementById("countries-beast-dropdown");
    const correct = country.code === state.currentQuestion.answer.code;
    const answerCode = state.currentQuestion.answer.code;

    input.value = country.name;
    input.disabled = true;
    dropdown.classList.remove("open");

    if (!state.progress[answerCode]) {
      state.progress[answerCode] = { right: 0, wrong: 0 };
    }

    const targetLayer = featuresByCode[answerCode];

    if (correct) {
      state.correct++;
      state.streak++;
      state.progress[answerCode].right++;
      input.classList.add("correct-answer");
      if (targetLayer) targetLayer.setStyle(S_CORRECT);
      document.getElementById("countries-result-text").textContent = "Correct!";
      document.getElementById("countries-result-text").className = "result-text correct";
      if (state.streak > state.bestStreak) state.bestStreak = state.streak;
      if (!state.celebratedNewBest && state.streak > (state.bestStreaks[state.difficulty] || 0)) {
        state.celebratedNewBest = true;
        triggerCelebration(state.bestStreak);
      }
    } else {
      state.wrong++;
      state.streak = 0;
      state.celebratedNewBest = false;
      state.progress[answerCode].wrong++;
      input.classList.add("wrong-answer");
      if (targetLayer) targetLayer.setStyle(S_CORRECT);
      const wrongLayer = featuresByCode[country.code];
      if (wrongLayer) wrongLayer.setStyle(S_WRONG);
      document.getElementById("countries-result-text").textContent =
        `It was ${state.currentQuestion.answer.name}`;
      document.getElementById("countries-result-text").className = "result-text wrong";
    }

    updateScoreboard();
    saveProgress();
    document.getElementById("countries-quiz-next").classList.add("visible");
  }

  // ============================================================
  // Scoreboard
  // ============================================================
  function updateScoreboard() {
    const el = id => document.getElementById(id);
    if (el("countries-score-correct")) el("countries-score-correct").textContent = state.correct;
    if (el("countries-score-wrong")) el("countries-score-wrong").textContent = state.wrong;
    if (el("countries-score-streak")) el("countries-score-streak").textContent = state.streak;
    if (el("countries-score-best")) el("countries-score-best").textContent = state.bestStreak;
  }

  // ============================================================
  // Progress
  // ============================================================
  function getMasteredCountries() {
    return availableCountries.filter(c => {
      const p = state.progress[c.code];
      return p && p.right >= MASTERY_THRESHOLD;
    });
  }

  function renderProgress() {
    let totalRight = 0, totalWrong = 0;
    Object.values(state.progress).forEach(p => {
      totalRight += p.right;
      totalWrong += p.wrong;
    });
    const totalAnswered = totalRight + totalWrong;
    const accuracy = totalAnswered > 0 ? Math.round((totalRight / totalAnswered) * 100) : 0;
    const mastered = getMasteredCountries();

    document.getElementById("countries-total-answered").textContent = totalAnswered;
    document.getElementById("countries-total-accuracy").textContent = accuracy + "%";
    document.getElementById("countries-total-mastered").textContent = mastered.length;

    const div = document.getElementById("countries-continent-progress");
    div.innerHTML = "";
    getContinents().filter(c => c !== "All").forEach(cont => {
      const countries = availableCountries.filter(c => c.continent === cont);
      const masteredInCont = countries.filter(c => {
        const p = state.progress[c.code];
        return p && p.right >= MASTERY_THRESHOLD;
      });
      const pct = countries.length > 0 ? Math.round((masteredInCont.length / countries.length) * 100) : 0;
      const w = document.createElement("div");
      w.className = "progress-bar-container";
      w.innerHTML = `
        <div class="progress-bar-label">
          <span>${cont}</span>
          <span>${masteredInCont.length} / ${countries.length}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill green" style="width:${pct}%"></div>
        </div>
      `;
      div.appendChild(w);
    });

    const list = document.getElementById("countries-mastered-list");
    list.innerHTML = "";
    if (mastered.length === 0) {
      list.innerHTML = '<div class="empty-msg">No countries mastered yet. Keep practicing!</div>';
    } else {
      mastered.forEach(c => {
        const tag = document.createElement("span");
        tag.className = "mastered-tag";
        tag.innerHTML = `<img src="${getFlagUrl(c.code)}" alt="" /> ${c.name}`;
        list.appendChild(tag);
      });
    }
  }

  // ============================================================
  // Study
  // ============================================================
  function renderStudy() {
    if (studyMap) {
      setTimeout(() => studyMap.invalidateSize(), 100);
      const bounds = CONTINENT_BOUNDS[state.studyContinent];
      if (bounds) studyMap.fitBounds(bounds, { animate: false });
    }
  }

  function searchStudy(query) {
    if (!studyMap || !query) return;
    query = query.toLowerCase();

    const match = availableCountries.find(c => c.name.toLowerCase().startsWith(query))
      || availableCountries.find(c => c.name.toLowerCase().includes(query));

    if (match) {
      const layer = studyFeaturesByCode[match.code];
      if (layer) {
        if (studyHighlighted && studyHighlighted !== layer) {
          studyGeoLayer.resetStyle(studyHighlighted);
        }
        layer.setStyle(S_HIGHLIGHT);
        layer.bringToFront();
        studyHighlighted = layer;
        studyMap.fitBounds(layer.getBounds().pad(0.5), { maxZoom: 7, animate: true });
      }
    }
  }

  // ============================================================
  // View Switching
  // ============================================================
  function onViewSwitch(view) {
    state.view = view;
    if (!initialized) return;

    if (view === "quiz") {
      setTimeout(() => { if (quizMap) quizMap.invalidateSize(); }, 100);
      if (!state.currentQuestion) newQuestion();
    } else if (view === "study") {
      renderStudy();
    } else if (view === "progress") {
      renderProgress();
    }
  }

  // ============================================================
  // Keyboard
  // ============================================================
  function handleKeydown(e) {
    if (state.view !== "quiz") return;
    if (state.difficulty === "beast" && !state.answered) return;

    if (state.answered && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      newQuestion();
      return;
    }

    const maxKey = DIFFICULTIES[state.difficulty].options;
    if (!state.answered && maxKey > 0 && e.key >= "1" && e.key <= String(Math.min(maxKey, 9))) {
      const btns = document.querySelectorAll("#countries-quiz-options .option-btn");
      const idx = parseInt(e.key) - 1;
      if (btns[idx]) btns[idx].click();
    }
  }

  function endSession() {
    state.bestStreaks[state.difficulty] = state.bestStreak;
    saveProgress();
    state.correct = 0;
    state.wrong = 0;
    state.streak = 0;
    state.celebratedNewBest = false;
    updateScoreboard();
  }

  // ============================================================
  // Event Listeners
  // ============================================================
  document.getElementById("countries-next-btn").addEventListener("click", () => newQuestion());

  document.getElementById("countries-reset-btn").addEventListener("click", () => {
    if (confirm("Reset all countries progress? This cannot be undone.")) {
      resetAllProgress();
      updateScoreboard();
      renderProgress();
    }
  });

  document.getElementById("countries-search-input").addEventListener("input", e => {
    searchStudy(e.target.value.trim());
  });

  // ============================================================
  // Public API
  // ============================================================
  return {
    init,
    switchView: onViewSwitch,
    handleKeydown,
    endSession,
    newQuestion,
    resetProgress: () => {
      resetAllProgress();
      updateScoreboard();
      renderProgress();
    },
  };
})();
