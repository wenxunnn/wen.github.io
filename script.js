/* ============================================================================
   THE CATALYST CASE — game engine
   ----------------------------------------------------------------------------
   This file is split into two parts:

     1. CONFIGURATION  — edit the story, cards, answers, hints, and unlock order.
     2. ENGINE          — rendering, state, and event wiring.

   The site is GitHub Pages friendly: HTML + CSS + JS only.
   Progress is saved in localStorage so a refresh does not reset the game.
============================================================================ */


/* ============================================================================
   1. CONFIGURATION — edit this section for your mystery
============================================================================ */

/* ---- Case board cards, in display order ----
   key            : unique id, also used as the unlock token
   screen         : id of the <section> to show when the card is opened
   title / sub    : text shown on the case-file card
   alwaysUnlocked : true for cards available from the very start
*/
const CARDS = [
  { key: "background", screen: "screen-background", title: "Letter from Dr. Soto", sub: "Background & request for help", alwaysUnlocked: true },
  { key: "clue1",       screen: "screen-clue1",       title: "Cipher Lock", sub: "A locked access panel", alwaysUnlocked: true },
  { key: "autopsy",     screen: "screen-autopsy",     title: "Autopsy Report", sub: "Temperature, injuries, examiner notes" },
  { key: "police",      screen: "screen-police",      title: "Police Report", sub: "Witnesses, alibis, access log" },
  { key: "research",    screen: "screen-research",    title: "Research Archive", sub: "DFT logs, sample labels, catalyst notes" },
  { key: "messages",    screen: "screen-messages",    title: "Recovered Messages", sub: "Deleted chat fragments and aliases" },
  { key: "final",       screen: "screen-final",       title: "Final Verdict", sub: "Name the murderer" },
];

/* ---- What unlocks what ----
   Solving a clue unlocks the card with this key.
   You can change the progression here.
*/
const UNLOCKS = {
  clue1: "autopsy",
  clue2: "police",
  clue3: "research",
  clue4: "messages",
  clue5: "final",
  final: "ending",
};

/* ---- Hints shown when the player taps "Hint" ----
   Hints are intentionally subtle. Make them clearer if your players get stuck.
*/
const HINTS = {
  clue1: "The blank spaces are part of the lock, not decoration. Some Roman endings take more room than others.",
  clue2: "A cold body tells time differently depending on the calendar.",
  clue3: "Do not read the statements alone. Put the time beside the access log and the seminar schedule.",
  clue4: "The archive has two almost-matching stories: the label that was printed, and the job that actually ran.",
  clue5: "One sender tried to become invisible by using a surface-science nickname. The nickname itself says where to look.",
};

/* ---- Answer checking ----
   Each function takes the player's raw text input and returns true/false.
   Helper functions are defined in the ENGINE section below.

   Editable solution summary:
   clue1 answer: 27, 17, 39 / XXVII, XVII, XXXIX
   clue2 answer: 4:00 PM
   clue3 answer: Daniel Whitlock
   clue4 answer: NI-2289 or 2289
   clue5 answer: terrace, step, or edge
   final answer: Daniel Whitlock
*/
const CHECKERS = {
  clue1: function (raw) {
    const tokens = raw
      .replace(/[,;]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const nums = tokens.map(parseNumberToken).filter((n) => n !== null);
    if (nums.length !== 3) return false;
    return nums[0] === 27 && nums[1] === 17 && nums[2] === 39;
  },

  clue2: function (raw) {
    const minutes = parseTimeToMinutes(raw);
    return minutes === 16 * 60; // 4:00 PM
  },

  clue3: function (raw) {
    const n = normalize(raw);
    return n.includes("daniel") || n.includes("whitlock") || n.includes("d whitlock");
  },

  clue4: function (raw) {
    const n = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
    return n.includes("ni2289") || n.includes("2289");
  },

  clue5: function (raw) {
    const n = normalize(raw);
    return n.includes("terrace") || n.includes("step") || n.includes("edge");
  },

  final: function (raw) {
    const n = normalize(raw);
    return n.includes("daniel") || n.includes("whitlock") || n.includes("daniel whitlock");
  },
};

/* Feedback messages shown after a correct/incorrect answer */
const MESSAGES = {
  correct: "Correct. A new file has been unlocked on the Case Board.",
  finalCorrect: "Correct. Opening the case summary...",
  incorrect: "Not quite. Check the file again, or tap Hint.",
  finalIncorrect: "That's not who the evidence points to. Review the case board before accusing again.",
};


/* ============================================================================
   2. ENGINE — you usually should not need to edit below this line
============================================================================ */

const STORAGE_KEY = "catalystCaseState_v2";
const CLUE_KEYS = ["clue1", "clue2", "clue3", "clue4", "clue5"];

function defaultState() {
  const unlocked = {};
  CARDS.forEach((c) => { unlocked[c.key] = !!c.alwaysUnlocked; });
  const solved = { final: false };
  CLUE_KEYS.forEach((key) => { solved[key] = false; });
  return { unlocked: unlocked, solved: solved };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const fresh = defaultState();
    return {
      unlocked: Object.assign(fresh.unlocked, parsed.unlocked || {}),
      solved: Object.assign(fresh.solved, parsed.solved || {}),
    };
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

/* ---- small parsing helpers ---- */

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/^(dr|prof|mr|mrs|ms)\.?\s+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function romanToInt(str) {
  const map = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const s = String(str || "").toLowerCase();
  if (!/^[ivxlcdm]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = map[s[i]];
    const next = map[s[i + 1]];
    if (next && cur < next) total -= cur;
    else total += cur;
  }
  return total;
}

function parseNumberToken(tok) {
  if (/^\d+$/.test(tok)) return parseInt(tok, 10);
  return romanToInt(tok);
}

function parseTimeToMinutes(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
  let m;

  m = s.match(/^(\d{1,2}):(\d{2})(am|pm)?$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3];
    if (ampm === "pm" && h !== 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return h * 60 + min;
  }

  m = s.match(/^(\d{1,2})(am|pm)$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const ampm = m[2];
    if (ampm === "pm" && h !== 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return h * 60;
  }

  m = s.match(/^(\d{3,4})$/);
  if (m) {
    const digits = m[1];
    const h = parseInt(digits.slice(0, digits.length - 2), 10);
    const min = parseInt(digits.slice(-2), 10);
    return h * 60 + min;
  }

  return null;
}

/* ---- rendering ---- */

function renderCards() {
  const grid = document.getElementById("cardGrid");
  grid.innerHTML = "";
  CARDS.forEach((card) => {
    const unlocked = !!state.unlocked[card.key];
    const div = document.createElement("div");
    div.className = "case-card " + (unlocked ? "unlocked" : "locked");
    div.innerHTML =
      '<div>' +
        '<p class="card-status">' + (unlocked ? "Unlocked" : "Locked") + '</p>' +
        '<p class="card-title">' + card.title + '</p>' +
        '<p class="card-sub">' + card.sub + '</p>' +
      '</div>' +
      (unlocked ? "" : '<div class="card-stamp">Classified</div>');
    if (unlocked) div.addEventListener("click", () => showScreen(card.screen));
    grid.appendChild(div);
  });
}

function renderProgress() {
  const dots = document.getElementById("progressDots");
  dots.innerHTML = "";
  CLUE_KEYS.forEach((key) => {
    const dot = document.createElement("span");
    dot.className = "progress-dot" + (state.solved[key] ? " filled" : "");
    dots.appendChild(dot);
  });
}

function refreshUI() {
  renderCards();
  renderProgress();
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---- answer submission ---- */

function handleSubmit(clueKey) {
  const input = document.getElementById("input-" + clueKey);
  const feedback = document.getElementById("feedback-" + clueKey);
  const raw = input ? input.value : "";
  const isCorrect = CHECKERS[clueKey](raw);

  if (isCorrect) {
    feedback.textContent = clueKey === "final" ? MESSAGES.finalCorrect : MESSAGES.correct;
    feedback.className = "feedback correct";

    if (clueKey !== "final") state.solved[clueKey] = true;
    const unlockKey = UNLOCKS[clueKey];
    if (unlockKey) state.unlocked[unlockKey] = true;
    saveState();
    refreshUI();

    if (clueKey === "final") {
      setTimeout(() => showScreen("screen-ending"), 900);
    }
  } else {
    feedback.textContent = clueKey === "final" ? MESSAGES.finalIncorrect : MESSAGES.incorrect;
    feedback.className = "feedback incorrect";
  }
}

function handleHint(clueKey) {
  const hintEl = document.getElementById("hint-" + clueKey);
  hintEl.textContent = HINTS[clueKey] || "";
  hintEl.classList.remove("hidden");
}

/* ---- wiring ---- */

document.addEventListener("click", (e) => {
  const submitKey = e.target.getAttribute("data-submit");
  if (submitKey) handleSubmit(submitKey);

  const hintKey = e.target.getAttribute("data-hint");
  if (hintKey) handleHint(hintKey);

  if (e.target.hasAttribute("data-back")) showScreen("screen-dashboard");
});

document.getElementById("btnOpenLetter").addEventListener("click", () => {
  showScreen("screen-background");
});

document.getElementById("btnReset").addEventListener("click", () => {
  if (confirm("Reset all progress? This cannot be undone.")) {
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    refreshUI();
    showScreen("screen-dashboard");
  }
});

/* submit on Enter key inside answer inputs */
document.querySelectorAll('.answer-box input[type="text"]').forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const clueKey = input.closest(".answer-box").getAttribute("data-clue");
      handleSubmit(clueKey);
    }
  });
});

/* restore feedback text if a puzzle was already solved before a refresh */
CLUE_KEYS.forEach((key) => {
  if (state.solved[key]) {
    const feedback = document.getElementById("feedback-" + key);
    if (feedback) {
      feedback.textContent = MESSAGES.correct;
      feedback.className = "feedback correct";
    }
  }
});

refreshUI();
