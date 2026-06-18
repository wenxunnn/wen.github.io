/* ============================================================================
   THE ASHBOURNE INQUIRY — game engine
   ----------------------------------------------------------------------------
   This file is split into two parts:

     1. CONFIGURATION  — everything you're likely to want to edit:
        card list, answers, hints, and what each clue unlocks.

     2. ENGINE          — rendering, state, and event wiring.
        You usually won't need to touch this part.

   State is saved to localStorage so progress survives a page refresh.
============================================================================ */


/* ============================================================================
   1. CONFIGURATION
============================================================================ */

/* ---- Case board cards, in display order ----
   key            : unique id, also used as the "unlock token"
   screen         : id of the <section> to show when the card is opened
   title / sub    : text shown on the case-file card
   alwaysUnlocked : true for cards available from the very start
*/
const CARDS = [
  { key: "background", screen: "screen-background", title: "Letter from Margaret Hale", sub: "Background & request for help", alwaysUnlocked: true },
  { key: "clue1",       screen: "screen-clue1",       title: "The Study Safe",       sub: "A locked combination safe",   alwaysUnlocked: true },
  { key: "autopsy",     screen: "screen-autopsy",     title: "Autopsy Report",       sub: "Medical examiner's file" },
  { key: "police",      screen: "screen-police",      title: "Police Report",        sub: "Witnesses, alibis, security log" },
  { key: "research",    screen: "screen-research",    title: "Company Ledger",       sub: "Audit trail & expense records" },
  { key: "final",       screen: "screen-final",       title: "Final Verdict",        sub: "Name the murderer" },
];

/* ---- What unlocks what ----
   solving clueX unlocks the card with this key.
   "final" being solved unlocks the ending screen automatically.
*/
const UNLOCKS = {
  clue1: "autopsy",
  clue2: "police",
  clue3: "research",
  clue4: "final",
  final: "ending",
};

/* ---- Hints shown when the player taps "Hint" ----
   Each clue has a small array of hints, vaguest first. Tapping "Hint"
   reveals one more level each time, so players who ask once still have
   to do most of the thinking themselves.
*/
const HINTS = {
  clue1: [
    "VII and IX don't take up the same amount of space when you write them out.",
    "A 5-character number could be 2 X's + VII, or 3 X's + IX. Work out both options for each blank length, then see which combination makes the ordering (smallest, then largest) actually work.",
  ],
  clue2: [
    "The examiner gave you a date and two temperatures, but no rate.",
    "Find the listed month on your reference card, then work out how many degrees he'd cooled and how long a drop like that takes at that rate.",
  ],
  clue3: [
    "Time of death isn't the only detail that has to line up.",
    "Only one name shows up inside the Study Wing during the window the autopsy points to, and that name doesn't match what that person told police.",
  ],
  clue4: [
    "The printed summary and the internal accounting log are supposed to describe the exact same numbers.",
    "Contractor fees is the line to check — the logged amount doesn't match what was printed, and the entry was edited the same week Theodore ordered the audit.",
  ],
};

/* ---- Answer checking ----
   Each function takes the player's raw text input and returns true/false.
   Helper functions (normalize, romanToInt, parseTimeToMinutes) are defined
   in the ENGINE section below.
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
    return n.includes("daniel") || n.includes("whitlock");
  },

  clue4: function (raw) {
    const n = raw.toLowerCase().replace(/[\s-]/g, "");
    return n.includes("2289");
  },

  final: function (raw) {
    const n = normalize(raw);
    return n.includes("daniel") || n.includes("whitlock");
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
   2. ENGINE — you shouldn't need to edit below this line
============================================================================ */

const STORAGE_KEY = "ashbourneInquiryState";

function defaultState() {
  const unlocked = {};
  CARDS.forEach((c) => { unlocked[c.key] = !!c.alwaysUnlocked; });
  return {
    unlocked: unlocked,
    solved: { clue1: false, clue2: false, clue3: false, clue4: false, final: false },
  };
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

/* how many hint levels have been revealed so far, per clue (not persisted —
   a fresh page load gives a clean slate, same as before) */
const hintLevels = { clue1: 0, clue2: 0, clue3: 0, clue4: 0 };

/* ---- small parsing helpers ---- */

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/^(dr|mr|mrs|ms)\.?\s+/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function romanToInt(str) {
  const map = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const s = str.toLowerCase();
  if (!/^[ivxlcdm]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = map[s[i]];
    const next = map[s[i + 1]];
    if (next && cur < next) {
      total -= cur;
    } else {
      total += cur;
    }
  }
  return total;
}

function parseNumberToken(tok) {
  if (/^\d+$/.test(tok)) return parseInt(tok, 10);
  const roman = romanToInt(tok);
  return roman;
}

function parseTimeToMinutes(raw) {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
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
    if (unlocked) {
      div.addEventListener("click", () => showScreen(card.screen));
    }
    grid.appendChild(div);
  });
}

function renderProgress() {
  const dots = document.getElementById("progressDots");
  dots.innerHTML = "";
  ["clue1", "clue2", "clue3", "clue4"].forEach((key) => {
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
  const raw = input.value || "";

  const isCorrect = CHECKERS[clueKey](raw);

  if (isCorrect) {
    feedback.textContent = clueKey === "final" ? MESSAGES.finalCorrect : MESSAGES.correct;
    feedback.className = "feedback correct";

    if (clueKey !== "final") {
      state.solved[clueKey] = true;
    }
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
  const hints = HINTS[clueKey];
  if (!hints || !hints.length) return;

  if (hintLevels[clueKey] < hints.length) {
    hintLevels[clueKey] += 1;
  }

  const hintEl = document.getElementById("hint-" + clueKey);
  const revealed = hints.slice(0, hintLevels[clueKey]);
  hintEl.innerHTML = revealed
    .map((text, i) => '<span class="hint-line">Hint ' + (i + 1) + ': ' + text + '</span>')
    .join("");
  hintEl.classList.remove("hidden");

  const btn = document.querySelector('button[data-hint="' + clueKey + '"]');
  if (btn) {
    if (hintLevels[clueKey] >= hints.length) {
      btn.disabled = true;
      btn.textContent = "No more hints";
    } else {
      btn.textContent = "Another hint";
    }
  }
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

    Object.keys(hintLevels).forEach((key) => { hintLevels[key] = 0; });
    document.querySelectorAll(".hint-text").forEach((el) => {
      el.innerHTML = "";
      el.classList.add("hidden");
    });
    document.querySelectorAll("button[data-hint]").forEach((btn) => {
      btn.disabled = false;
      btn.textContent = "Hint";
    });
    document.querySelectorAll(".feedback").forEach((el) => {
      el.textContent = "";
      el.className = "feedback";
    });
    document.querySelectorAll(".answer-box input[type='text']").forEach((input) => {
      input.value = "";
    });

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
["clue1", "clue2", "clue3", "clue4"].forEach((key) => {
  if (state.solved[key]) {
    const feedback = document.getElementById("feedback-" + key);
    if (feedback) {
      feedback.textContent = MESSAGES.correct;
      feedback.className = "feedback correct";
    }
  }
});

refreshUI();
