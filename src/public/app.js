// @ts-check

/** @typedef {import('../types.js').QueueItem} QueueItem */
/** @type {typeof import('./queue-merge-filter.js') | null} */
let mergeFilterMod = null;

async function ensureMergeFilterMod() {
  if (!mergeFilterMod) {
    mergeFilterMod = await import('./queue-merge-filter.js');
  }
  return mergeFilterMod;
}
/** @typedef {import('../types.js').Queue} Queue */
/** @typedef {import('../types.js').History} History */
/** @typedef {import('../types.js').Config} Config */

// ── State ───────────────────────────────────────────────

let state = {
  /** @type {Queue} */
  queue: { scannedAt: '', version: '', items: [] },
  /** @type {History} */
  history: { entries: [] },
  /** @type {Config | null} */
  config: null,
  lastRun: { lastRunDate: null, lastRunVersion: null },
  user: null,
  activeTab: 'queue',
  /** @type {'all' | 'yes' | 'check' | 'no' | 'yes,check'} */
  queueFilter: 'all',
  /** @type {string} */
  queueVersionFilter: 'all',
  /** @type {'all' | 'new' | 'update' | 'api-update' | 'unknown'} */
  queueDocWorkFilter: 'all',
  /** @type {'all' | 'focus' | string} */
  queueCategoryFilter: 'all',
  /** @type {'all' | 'p0,p1' | 'p0' | 'p1' | 'p2' | 'p3' | 'unrated'} */
  queuePriorityFilter: 'all',
  /** @type {'all' | '7d' | '30d' | '90d' | 'since-scan' | 'custom'} */
  queueMergeFilter: 'all',
  /** @type {string} */
  queueMergeFrom: '',
  /** @type {string} */
  queueMergeTo: '',
  /** @type {Set<string>} */
  selectedQueueIds: new Set(),
  bulkBusy: false,
};

// ── API helpers ─────────────────────────────────────────

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Init ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await ensureMergeFilterMod();
  for (const [key, field, storageKey] of [
    ['queue-filter', 'queueFilter', 'queue-filter'],
    ['queue-version-filter', 'queueVersionFilter', 'queue-version-filter'],
    ['queue-doc-work-filter', 'queueDocWorkFilter', 'queue-doc-work-filter'],
    ['queue-category-filter', 'queueCategoryFilter', 'queue-category-filter'],
    ['queue-priority-filter', 'queuePriorityFilter', 'queue-priority-filter'],
    ['queue-merge-filter', 'queueMergeFilter', 'queue-merge-filter'],
  ]) {
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) continue;
    state[field] = saved;
    const sel = document.getElementById(key);
    if (sel && [...sel.options].some((o) => o.value === saved)) sel.value = saved;
  }
  const mergeFrom = sessionStorage.getItem('queue-merge-from');
  const mergeTo = sessionStorage.getItem('queue-merge-to');
  if (mergeFrom) state.queueMergeFrom = mergeFrom;
  if (mergeTo) state.queueMergeTo = mergeTo;
  bindTooltips();
  bindScanContextCollapse();
  bindScanScopeActions();
  bindBulkActions();
  bindEvents();
  await loadUserAvatar();
  await refreshAll();
});

async function loadUserAvatar() {
  try {
    const user = await api('/user');
    state.user = user;
    if (user.avatarUrl) {
      const img = document.getElementById('user-avatar');
      img.src = user.avatarUrl;
      img.alt = user.login;
      img.title = user.login;
      img.style.display = '';
    }
  } catch {
    // Silently ignore — avatar is non-essential
  }
}

const QUEST_ANIMALS = [
  {
    svg: `<svg class="quest-animal" viewBox="0 0 24 20"><path d="M5,18 V11 M8,18 V11 M16,18 V11 M19,18 V11 M4,11 Q12,8 20,11 M5,11 V5 Q5,3 6,2 L8,3 L6,4 M20,11 Q22,10 21,12"/></svg>`,
    tooltips: ['Majestic as a llama on a mountaintop', 'Steady and sure-footed, like a llama carrying the team', 'The llama of documentation — calm, reliable, unstoppable'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 22 20"><path d="M4,18 V11 M7,18 V11 M15,18 V11 M18,18 V11 M3,11 Q11,8 19,11 M4,11 V8 L3,6 M4,8 L3,4 M4,8 L5,4 M4,8 L4,11 M3,9 L2,11"/></svg>`,
    tooltips: ['Stubborn as a goat — in the best way', 'Climbs any mountain of PRs, goat-style', 'Has the heart of a mountain goat: fearless and sure'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 24 20"><path d="M6,18 V12 M9,18 V12 M16,18 V12 M19,18 V12 M5,12 Q12,9 20,12 M5,12 L4,9 L5,6 L4,3 M5,6 L6,3 M5,8 L7,7 M20,12 Q23,8 21,6"/></svg>`,
    tooltips: ['Leads the pack like a wolf in moonlight', 'Loyal as a wolf — the team is lucky to have you', 'Sharp instincts, wolf-level focus'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 28 18"><path d="M14,8 L8,4 L3,2 L1,5 L6,6 L10,7 M14,8 L20,4 L25,2 L27,5 L22,6 L18,7 M14,8 V14 L12,16 L14,15 L16,16 L14,14 M13,7 L11,8 L12,7"/></svg>`,
    tooltips: ['Eagle-eyed reviewer, nothing gets past you', 'Soaring above the PR queue with eagle grace', 'Vision of an eagle — spots every doc gap'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 26 16"><path d="M1,10 Q7,6 12,8 L12,3 L14,8 Q20,6 24,10 Q20,12 14,11 Q8,12 1,10 M24,10 L26,8 M24,10 L26,12"/></svg>`,
    tooltips: ['Cuts through the backlog like a shark through water', 'Shark mode: fast, focused, unstoppable', 'The documentation shark — always moving forward'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 24 20"><path d="M6,18 V12 M9,18 V12 M16,18 V12 M19,18 V12 M5,12 Q12,9 20,12 M5,12 L4,9 L3,6 M4,9 L5,6 M4,9 L6,8 M20,12 Q24,10 22,7 Q23,9 21,11"/></svg>`,
    tooltips: ['Clever as a fox — always finds the right page to update', 'Fox-like agility through the triage queue', 'Sly fox energy: quick, sharp, and charming'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 24 16"><path d="M5,12 L4,14 M9,12 L8,14 M15,12 L16,14 M19,12 L20,14 M4,10 Q12,3 20,10 Q12,13 4,10 M8,7 Q12,5 16,7 M4,10 L2,9 L3,8"/></svg>`,
    tooltips: ['Slow and steady wins the triage, turtle wisdom', 'Tough shell, warm heart — the turtle way', 'Turtle power: methodical, thorough, legendary'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 20 20"><path d="M10,2 Q4,2 4,8 L2,14 L6,12 L6,16 L10,18 L14,16 L14,12 L18,14 L16,8 Q16,2 10,2 M7,7 A1.5,1.5 0 1,0 7,10 A1.5,1.5 0 1,0 7,7 M13,7 A1.5,1.5 0 1,0 13,10 A1.5,1.5 0 1,0 13,7 M9,11 L10,12 L11,11"/></svg>`,
    tooltips: ['Wise as an owl — sees what others miss', 'The owl of the docs team: watchful, wise, wonderful', 'Night owl energy: gets it done when it matters'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 24 18"><path d="M6,14 Q12,6 18,14 M8,14 V17 M16,14 V17 M9,9 A1.2,1.2 0 1,0 9,11.4 A1.2,1.2 0 1,0 9,9 M15,9 A1.2,1.2 0 1,0 15,11.4 A1.2,1.2 0 1,0 15,9 M12,12 Q10,13 12,14 Q14,13 12,12"/></svg>`,
    tooltips: ['Leaps between PRs like a frog between lily pads', 'Ribbit-level focus on what needs docs', 'Pond-clear judgment — splashy when it counts'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 24 16"><path d="M5,13 Q12,4 19,13 M7,13 V16 M17,13 V16 M8,8 A1,1 0 1,0 8,10 A1,1 0 1,0 8,8 M16,8 A1,1 0 1,0 16,10 A1,1 0 1,0 16,8 M10,11 H14 M11,10 L10,11 M14,10 L15,11 M6,7 L7,6 M18,7 L17,6"/></svg>`,
    tooltips: ['Toad ally of the backlog — warty wisdom, solid landings', 'Squats on ambiguity until it resolves', 'Garden-witch energy: patient, terrestrial, thorough'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 26 18"><path d="M8,9 L4,7 L2,9 L6,10 M18,9 L22,7 L24,9 L20,10 M13,9 V15 M11,15 H15 M13,7 L11,5 M13,7 L15,5 M10,6 A1,1 0 1,0 10,8 A1,1 0 1,0 10,6"/></svg>`,
    tooltips: ['Nevermore gaps — the raven remembers every broken link', 'Croaks once per missed release note', 'Dark-feathered scribe of the merge queue'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 24 24"><path d="M12,12 L12,4 M12,12 L6,7 M12,12 L18,7 M12,12 L5,14 M12,12 L19,14 M12,12 L7,19 M12,12 L17,19 M12,12 L12,20 M10,11 A1.2,1.2 0 1,0 14,11 A1.2,1.2 0 1,0 10,11"/></svg>`,
    tooltips: ['Weaves threads of triage across the web', 'Eight legs, zero missed cross-references', 'Patient spider — catches scope creep in the silk'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 24 22"><path d="M12,3 L9,6 L8,2 M12,3 L15,6 L16,2 M12,8 Q8,10 7,15 M12,8 Q16,10 17,15 M7,15 V19 M17,15 V19 M9,19 V21 M15,19 V21 M11,15 L12,12 L13,15"/></svg>`,
    tooltips: ['Gentle steps through dense release forests', 'Antlers high — navigates doc debt with grace', 'Forest-quiet reviewer; hears every rustle in the diff'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 26 14"><path d="M3,10 Q8,4 13,8 Q18,12 23,6 M20,6 L23,5 M23,6 L22,9 M6,9 A0.8,0.8 0 1,0 6,10.6 A0.8,0.8 0 1,0 6,9"/></svg>`,
    tooltips: ['Slides through nested bullets without friction', 'Serpent-smooth prose fixes', 'Coils around confusing API text until it clarifies'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 28 12"><path d="M2,8 Q7,5 12,7 Q17,9 22,6 Q25,4 26,6 M24,6 L26,5 M24,6 L25,8"/></svg>`,
    tooltips: ['Eel in the data stream — finds the doc gap in the dark', 'Slippery edges, sharp eye', 'Current-powered triage at depth'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 24 22"><path d="M12,6 A4,4 0 1,0 12,14 A4,4 0 1,0 12,6 M8,14 Q6,17 5,20 M10,14 Q9,18 8,21 M12,14 V21 M14,14 Q15,18 16,21 M16,14 Q18,17 19,20 M10,8 A0.8,0.8 0 1,0 10,9.6 A0.8,0.8 0 1,0 10,8 M14,8 A0.8,0.8 0 1,0 14,9.6 A0.8,0.8 0 1,0 14,8"/></svg>`,
    tooltips: ['Many arms, one coherent issue body', 'Inky reach across the repo', 'Octo-triage: holds the template, the PR, and your coffee'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 22 16"><path d="M11,4 L7,6 L6,10 L11,12 L16,10 L15,6 Z M6,8 L3,9 M16,8 L19,9 M8,12 L7,15 M14,12 L15,15 M11,4 V2 M11,2 L10,1 M11,2 L12,1"/></svg>`,
    tooltips: ['Armored against nitpicks — beetle resilience', 'Small, shiny, impossible to ignore in the changelog', 'Scuttles straight to the root cause'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 26 14"><path d="M4,9 Q8,6 12,8 Q16,10 20,8 M6,8 L5,7 M20,8 L21,7 M8,8 V10 M18,8 V10 M6,10 L4,12 M20,10 L22,12 M12,8 L12,5 M10,5 L12,4 L14,5"/></svg>`,
    tooltips: ['Amphibian patience for damp, half-finished drafts', 'Tail of fire, heart of editor', 'Lives in both water and words — adapts fast'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 22 22"><path d="M11,4 L8,7 L8,3 M11,4 L14,7 L14,3 M6,9 Q11,6 16,9 M8,9 A1.2,1.2 0 1,0 8,11.4 A1.2,1.2 0 1,0 8,9 M14,9 A1.2,1.2 0 1,0 14,11.4 A1.2,1.2 0 1,0 14,9 M11,11 L9,14 L11,18 L13,14 Z"/></svg>`,
    tooltips: ['Ear-tufted owl — hears typos in the dark', 'Perches on release branches; hunts at GA', 'Twilight reviewer with talons for vague release notes'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 20 18"><path d="M10,3 Q5,3 5,8 Q5,11 10,11 Q15,11 15,8 Q15,3 10,3 M10,11 V15 M7,15 H13 M10,8 A1,1 0 1,0 10,10 A1,1 0 1,0 10,8 M8,6 L7,5 M12,6 L13,5"/></svg>`,
    tooltips: ['Mushroom muse — grows docs in shady corners', 'Spore-spreader of clear explanations', 'Forest-floor finder of undocumented behavior'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 24 20"><path d="M8,12 Q12,4 16,12 M6,12 Q12,8 18,12 M12,12 V16 M9,16 H15 M12,7 A1,1 0 1,0 12,9 A1,1 0 1,0 12,7"/></svg>`,
    tooltips: ['Cluster of clarity — many caps, one mycelial mind', 'Fruiting body of the triage ritual', 'Pops up after rain and merged PRs'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 26 18"><path d="M4,14 Q8,12 12,14 Q16,12 20,14 M6,14 Q12,8 18,14 M12,8 Q10,6 12,4 Q14,6 12,8 M8,10 L6,9 M16,10 L18,9"/></svg>`,
    tooltips: ['Mycelium mapper — connects pages under the soil', 'Invisible threads, visible doc gaps', 'Network fungus; routes issues like nutrient paths'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 24 16"><path d="M4,12 L4,8 Q8,6 12,8 Q16,6 20,8 L20,12 M6,10 L5,9 M18,10 L19,9 M12,8 V5 M10,5 H14"/></svg>`,
    tooltips: ['Bracket on the trunk — slow, structural fixes', 'Shelf fungus patience for tech debt', 'Clings to legacy docs until updated'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 22 16"><path d="M11,14 V8 M8,14 V10 M14,14 V10 M11,8 Q11,4 8,3 M11,8 Q11,4 14,3 M6,14 H16"/></svg>`,
    tooltips: ['Lichen logic — symbiosis of accuracy and style', 'Crusty, colorful, surprisingly resilient', 'Grows on stone docs until they breathe again'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 22 24"><path d="M11,4 Q7,8 7,14 Q7,18 11,20 Q15,18 15,14 Q15,8 11,4 M11,20 V22 M8,10 Q11,12 14,10 M6,14 L4,16 M16,14 L18,16"/></svg>`,
    tooltips: ['Oak-deep roots — docs that outlast releases', 'Canopy shade for writers in a heatwave of PRs', 'Rings of wisdom in every changelog year'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 20 24"><path d="M10,4 L8,8 M10,4 L12,8 M10,4 V2 M10,8 Q6,12 6,18 M10,8 Q14,12 14,18 M6,18 L6,22 M14,18 L14,22 M8,12 L7,11 M12,12 L13,11"/></svg>`,
    tooltips: ['Pine straight and evergreen — procedures that stay true', 'Needle-sharp attention to version strings', 'Resin-scent of fresh issue templates'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 20 22"><path d="M10,3 Q6,8 6,14 Q6,19 10,21 Q14,19 14,14 Q14,8 10,3 M10,21 V22 M7,12 L6,10 M13,12 L14,10 M5,16 Q10,14 15,16"/></svg>`,
    tooltips: ['Birch-bright bark — easy to spot what changed', 'Paper-white clarity in the opening paragraph', 'Slender tree, sturdy structure'],
  },
  {
    svg: `<svg class="quest-animal" viewBox="0 0 26 22"><path d="M13,4 Q8,10 7,16 Q6,20 13,20 Q20,20 19,16 Q18,10 13,4 M13,20 V21 M9,14 Q13,12 17,14 M11,9 L10,8 M15,9 L16,8"/></svg>`,
    tooltips: ['Old-growth gravitas — triage with deep time', 'Twisted branches, straight narratives', 'The grove remembers every deprecated setting'],
  },
];

/** @param {{ includeWitch?: boolean }} [opts] */
function randomQuestMascot(opts = {}) {
  const pool = opts.includeWitch ? [...QUEST_ANIMALS, QUEST_WITCH] : QUEST_ANIMALS;
  const animal = pool[Math.floor(Math.random() * pool.length)];
  const tooltip = animal.tooltips[Math.floor(Math.random() * animal.tooltips.length)];
  const witchMascot = animal === QUEST_WITCH;
  const wrapClass = witchMascot ? 'quest-animal-wrap quest-animal-wrap--witch' : 'quest-animal-wrap';
  return `<span class="${wrapClass}" data-tooltip="${tooltip}">${animal.svg}</span>`;
}

const QUEST_WITCH = {
  svg: `<svg class="quest-animal quest-animal--witch" viewBox="0 0 24 22" aria-hidden="true">
    <path d="M12 3 L19 11 H5 Z" />
    <path d="M9 11 H15 V12 Q15 14 12 14 Q9 14 9 12 Z" />
    <path d="M7 16 Q12 13 17 16" />
    <path d="M18 20 L19.5 14 M19 17 L21 15.5" />
  </svg>`,
  tooltips: [
    'The documentation witch — triage by candlelight',
    'Warlock of the release notes: knowledge demands clarity',
    'Shadow, script, and changelog',
    'Keeper of the warded queue',
    'Hex the backlog, bless the merge',
    'Scrying the PR runes since dawn',
    'Moon-priestess of the triage circle',
    'Your familiar naps; you do not',
    'Salt, sage, and semantic versioning',
    'The athame chooses the worthy page',
  ],
};

const WARLOCK_GREETINGS = [
  'By shadow and script',
  'The grimoire stirs',
  'As the coven wills it',
  'Candle high — the queue calls',
  'The ritual of triage begins',
  'By starlight and changelog',
  'The veil thins',
  'Hear the familiar scratch at the ledger',
  'Salt the threshold — work awaits',
  'The athame points to unfinished lore',
  'Mercury is in retrograde and so is this queue',
  'From my tower I see your summons',
  'The bones have spoken',
  'Ash and ink, witch',
  'By the old words and the new releases',
  'The circle is cast',
  'Mind the ward — spirits of scope creep linger',
  'The cauldron bubbles with merged PRs',
  'As above in Kibana, so below in the docs',
  'Thirteen tabs open, one truth to write',
  'The moon is waxing; so is the backlog',
  'Fetch your focus — the ritual wants it',
  'By herb and hyperlink',
  'The tarot turned up “needs docs”',
  'Whispered once, filed twice',
  'Patience, power, and patch releases',
  'The runes are fresh off the scanner',
  'Sight unclouded, quill uncapped',
  'What is written in shadow must be published in light',
  'By bell, book, and broken cross-link',
];

/**
 * @param {string} mark
 * @param {string} greeting
 * @param {string} n
 * @param {number} count
 * @param {string} q
 * @param {boolean} singular
 */
function witchQuestLines(mark, greeting, n, count, q, singular) {
  const r = singular ? 'requires' : 'require';
  const a = singular ? 'awaits' : 'await';
  const h = singular ? 'has' : 'have';
  const d = singular ? 'demands' : 'demand';
  const rem = singular ? 'remains' : 'remain';
  return [
    `${mark}${greeting}, ${n}! The spellbook lists ${count} ${q} that ${r} your judgment.`,
    `${mark}${greeting}, ${n}! ${count} ${q} ${a} resolution by moonlight.`,
    `${mark}${greeting}, ${n}! The coven whispers of ${count} ${q} still loose in the queue.`,
    `${mark}${greeting}, ${n}! ${count} ${q} ${d} ink, nerve, and a steady hand.`,
    `${mark}${greeting}, ${n}! ${count} urgent ${q} ${h} surfaced from the shadows.`,
    `${mark}${greeting}, ${n}! ${count} thread${singular ? '' : 's'} of fate ${rem} for you to weave.`,
    `${mark}${greeting}, ${n}! The scrying bowl shows ${count} ${q} not yet bound to issues.`,
    `${mark}${greeting}, ${n}! ${count} sigil${singular ? '' : 's'} on the ward pulse for your touch.`,
    `${mark}${greeting}, ${n}! The familiars report ${count} ${q} circling the backlog.`,
    `${mark}${greeting}, ${n}! ${count} page${singular ? '' : 's'} of prophecy ${a} your red ink.`,
    `${mark}${greeting}, ${n}! Through smoke and semver: ${count} ${q} call your name.`,
    `${mark}${greeting}, ${n}! The crystals warmed — ${count} ${q} ${h} entered the circle.`,
    `${mark}${greeting}, ${n}! A charm upon you: ${count} ${q} to set right before dawn.`,
    `${mark}${greeting}, ${n}! The herb bundle dries; ${count} ${q} do not.`,
    `${mark}${greeting}, ${n}! Stars align on ${count} ${q} — the ritual chooses you.`,
    `${mark}${greeting}, ${n}! ${count} whisper${singular ? '' : 's'} in the stack ${a} documentation.`,
    `${mark}${greeting}, ${n}! Burn the sage: ${count} ${q} still hungry for clarity.`,
    `${mark}${greeting}, ${n}! The tower bell tolls ${count} — ${q} at the gate.`,
    `${mark}${greeting}, ${n}! Your grimoire gains ${count} new line${singular ? '' : 's'} of unfinished work.`,
    `${mark}${greeting}, ${n}! The veil parts on ${count} ${q} ripe for binding.`,
    `${mark}${greeting}, ${n}! Salt, bell, and quill — ${count} ${q} ${d} the ritual.`,
    `${mark}${greeting}, ${n}! Even the ravens gossip: ${count} ${q} need a witch's eye.`,
    `${mark}${greeting}, ${n}! Moonwater cools; ${count} hot ${q} ${rem}.`,
    `${mark}${greeting}, ${n}! The tarot dealt ${count} card${singular ? '' : 's'} — each an omen still unfiled.`,
  ];
}

/** @param {string} mark @param {string} n */
function witchRestLines(mark, n) {
  return [
    `${mark}The cauldron rests, ${n}. No quests on the ward.`,
    `${mark}All rites complete, ${n}. Close the grimoire and breathe.`,
    `${mark}Your queue is clear, ${n}. Even warlocks need quiet hours.`,
    `${mark}No new summons, ${n}. Let the candles gutter out.`,
    `${mark}The circle fades, ${n}. Only moonlight on an empty backlog.`,
    `${mark}Silence in the tower, ${n}. The familiars finally sleep.`,
    `${mark}The inkwell is still, ${n}. No runes demand you tonight.`,
    `${mark}Rest your athame, ${n}. The queue sleeps beneath salt and ash.`,
    `${mark}The scrying glass shows nothing, ${n}. A rare peace.`,
    `${mark}No whispers from the merge train, ${n}. Steep the tea.`,
    `${mark}Your ward holds, ${n}. Nothing breaches the empty log.`,
    `${mark}Stars wheel on without errand, ${n}. Enjoy the hush.`,
    `${mark}The spell is complete, ${n}. Till the next scan stirs the leaves.`,
    `${mark}Bone dice show blanks, ${n}. Take the night.`,
    `${mark}Even the changelog is quiet, ${n}. Curl up with something that isn't YAML.`,
    `${mark}The broom leans idle, ${n}. No chase through the PR forest.`,
    `${mark}Smoke clears; no new omens, ${n}. The coven releases you.`,
    `${mark}Crystal cooled, ${n}. No futures left to file tonight.`,
  ];
}

/** Personal mascot + tone for fork maintainer; everyone else keeps random quest animals. */
function isWitchQueueUser(user) {
  if (!user) return false;
  const login = (user.login ?? '').toLowerCase();
  const first = (user.name ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return login === 'nastasha-solomon' || first === 'nastasha';
}

function questMascotForUser(user) {
  return randomQuestMascot({ includeWitch: isWitchQueueUser(user) });
}

function randomGreeting(user) {
  if (isWitchQueueUser(user)) {
    return WARLOCK_GREETINGS[Math.floor(Math.random() * WARLOCK_GREETINGS.length)];
  }
  return Math.random() < 0.5 ? 'For the Light' : "Lok'tar ogar";
}

function renderHeroGreeting() {
  const el = document.getElementById('hero-greeting');
  const textEl = document.getElementById('hero-text');
  const iconEl = document.getElementById('hero-icon');
  if (!el || !textEl) return;

  const user = state.user;
  let displayName = 'Adventurer';
  if (user?.name) {
    displayName = user.name.split(/\s+/)[0];
  } else if (user?.login) {
    displayName = user.login;
  }

  const queueCount = state.queue?.items?.length ?? 0;
  const animal = questMascotForUser(user);
  const witch = isWitchQueueUser(user);

  iconEl.style.display = 'none';

  if (queueCount > 0) {
    const mark = '<span class="quest-mark">!</span> ';
    const s = queueCount === 1;
    const q = s ? 'quest' : 'quests';
    const greeting = randomGreeting(user);
    const n = `<strong>${esc(displayName)}</strong>${animal}`;
    const questLines = witch
    ? witchQuestLines(mark, greeting, n, queueCount, q, s)
    : [
      `${mark}${greeting}, ${n}! I have ${queueCount} ${q} that ${s ? 'requires' : 'require'} your attention.`,
      `${mark}${greeting}, ${n}! ${queueCount} ${q} ${s ? 'awaits' : 'await'} your judgment.`,
      `${mark}${greeting}, ${n}! The war effort needs you. ${queueCount} ${q} ${s ? 'remains' : 'remain'}.`,
      `${mark}${greeting}, ${n}! ${queueCount} ${q} ${s ? 'demands' : 'demand'} resolution.`,
      `${mark}${greeting}, ${n}! ${queueCount} urgent ${q} ${s ? 'has' : 'have'} arrived.`,
    ];
    textEl.innerHTML = questLines[Math.floor(Math.random() * questLines.length)];
    el.className = witch ? 'hero-greeting hero-quests hero-quests--witch' : 'hero-greeting hero-quests';
  } else {
    const mark = '<span class="quest-mark quest-mark--done">?</span> ';
    const n = `<strong>${esc(displayName)}</strong>${animal}`;
    const restLines = witch ? witchRestLines(mark, n) : [
        `${mark}Rest well, ${n}. You have no quests. The realm is at peace.`,
        `${mark}All quests complete, ${n}. Return to the inn and rest.`,
        `${mark}Your quest log is empty, ${n}. A rare moment of peace in Azeroth.`,
        `${mark}No new orders, ${n}. Even heroes need to rest at the hearthstone.`,
      ];
    textEl.innerHTML = restLines[Math.floor(Math.random() * restLines.length)];
    el.className = witch ? 'hero-greeting hero-rest hero-rest--witch' : 'hero-greeting hero-rest';
  }

  el.style.display = '';
  requestAnimationFrame(() => el.classList.add('hero-visible'));
}



async function refreshAll() {
  try {
    const [queue, history, config, lastRun] = await Promise.all([
      api('/queue'),
      api('/history'),
      api('/config'),
      api('/last-run'),
    ]);
    state.queue = queue;
    state.history = history;
    state.config = config;
    state.lastRun = lastRun;
    populateQueueVersionFilterOptions();
    populateQueueMergeFilterOptions();
    populateQueueCategoryFilterOptions();
    populateQueuePriorityFilterOptions();
    applyDefaultQueueFiltersIfUnset();
    syncQueueFilterControls();
    pruneQueueSelection();
    render();
    renderHeroGreeting();
  } catch (err) {
    showToast(`Failed to load: ${err.message}`, 'error');
  }
}

// ── Rendering ───────────────────────────────────────────

function render() {
  renderStatusBar();
  renderScanContext();
  renderQueue();
  renderHistory();
  renderTabCounts();
}

function renderStatusBar() {
  const lastScanInfo = document.getElementById('last-scan-info');

  if (state.lastRun?.lastRunDate && !state.queue.scannedAt) {
    lastScanInfo.textContent = `Last scan: ${formatDate(state.lastRun.lastRunDate)}`;
  } else {
    lastScanInfo.textContent = '';
  }

  // Set title from config
  if (state.config?.title) {
    const titleEl = document.getElementById('app-title');
    if (titleEl) titleEl.textContent = state.config.title;
    document.title = state.config.title;
  }

  // Show last completed scan date near the complete button
  const infoEl = document.getElementById('scan-complete-info');
  if (infoEl) {
    const lastDate = state.lastRun?.lastRunDate;
    infoEl.textContent = lastDate
      ? `Last completed: ${formatDate(lastDate)}`
      : 'No previous scan completed';
  }
}

/** Same rule as the skill's enrichment guard (SKILL.md Step 2). */
function itemNeedsEnrichment(item) {
  const a = item.assessment ?? {};
  if (a.prefiltered) return false;
  if (a.dismissReason === 'owned by dev') return false;
  return !(Array.isArray(a.docsGap) && a.docsGap.length > 0);
}

function pendingEnrichmentCount() {
  return (state.queue.items ?? []).filter(itemNeedsEnrichment).length;
}

/** Repo groups from either the multi-repo `repos[]` config or the legacy flat shape. */
function scanScopeGroups(config) {
  if (Array.isArray(config.repos) && config.repos.length) return config.repos;
  return [
    {
      source: config.sourceRepo,
      categories: config.categories ?? [],
      releaseNoteLabels: config.releaseNoteLabels,
    },
  ];
}

function renderScanContext() {
  const section = document.getElementById('queue-section-scan');
  const factsEl = document.getElementById('scan-scope-facts');
  const bodyEl = document.getElementById('scan-context-body');
  const config = state.config;
  if (!config || !factsEl || !bodyEl) {
    if (section) section.style.display = 'none';
    return;
  }

  const groups = scanScopeGroups(config);
  const sources = groups
    .map((g) => (g.source ? `${g.source.owner}/${g.source.repo}` : ''))
    .filter(Boolean);
  const categories = groups.flatMap((g) => g.categories ?? []);
  const teamLabelCount = new Set(categories.flatMap((c) => c.labels ?? [])).size;
  const releaseLabels = [
    ...new Set(groups.flatMap((g) => g.releaseNoteLabels ?? config.releaseNoteLabels ?? [])),
  ];
  const excludeLabels = [
    ...new Set([...(config.excludeLabels ?? []), ...groups.flatMap((g) => g.excludeLabels ?? [])]),
  ];
  const excludeTitles = [
    ...new Set([
      ...(config.excludeTitlePatterns ?? []),
      ...groups.flatMap((g) => g.excludeTitlePatterns ?? []),
    ]),
  ];

  const since = state.lastRun?.lastRunDate;
  const scannedAt = state.queue.scannedAt;

  /** @param {string} term @param {string} valueHtml @param {string} [tip] */
  const fact = (term, valueHtml, tip = '') =>
    `<div class="scan-scope__fact"><dt${tip ? ` class="tip-label"${tipAttr(tip)}` : ''}>${esc(term)}</dt><dd>${valueHtml}</dd></div>`;

  factsEl.innerHTML = [
    fact(
      sources.length > 1 ? 'Repos' : 'Repo',
      esc(sources.join(', ') || '—'),
      'Where the scan looks for merged PRs'
    ),
    fact(
      'Merged since',
      since ? esc(formatDate(since)) : 'Last 14 days',
      'Start of the scan window. Moves forward only when you click Mark scan complete.'
    ),
    fact(
      'Last scan run',
      scannedAt ? esc(formatDateTime(scannedAt)) : 'Not scanned yet',
      'When the queue was last fetched from GitHub. This is the end of the scan window.'
    ),
    fact(
      'Categories',
      `${categories.length} <span class="scan-scope__muted">· ${teamLabelCount} team labels</span>`,
      'Team groupings from your config. A PR joins a category when it has one of its team labels. Open "Show categories and labels" for the full list.'
    ),
  ].join('');

  const runBtn = document.getElementById('btn-run-scan');
  if (runBtn) {
    const mergeWindow = since ? `merged since ${formatDate(since)}` : 'merged in the last 14 days';
    runBtn.dataset.tip =
      `Checks GitHub for PRs ${mergeWindow} that match your categories and release note labels. ` +
      'Your edits and enrichment are kept, and new items will need enrichment. Can take a few minutes.';
  }

  const pending = pendingEnrichmentCount();
  const pendingLabel = `${pending} item${pending === 1 ? '' : 's'}`;
  const enrichBtn = document.getElementById('btn-enrich');
  if (enrichBtn) {
    enrichBtn.textContent = pending ? `Enrich ${pendingLabel}` : 'All items enriched';
    enrichBtn.disabled = pending === 0;
    enrichBtn.classList.toggle('btn-primary', pending > 0);
  }
  const enrichTip = document.getElementById('enrich-tip-wrap');
  if (enrichTip) {
    enrichTip.dataset.tip = pending
      ? `Opens a prompt to paste into Claude Code. The AI reads each PR and the published docs, then fills in doc gaps, effort, and priority for the ${pendingLabel} not analyzed yet. Nothing runs from this page.`
      : 'Nothing to enrich. Every item has been analyzed or was pre-filtered as not needing docs.';
  }

  /** @type {Map<string, number>} */
  const countByCategory = new Map();
  for (const item of state.queue.items ?? []) {
    countByCategory.set(item.category, (countByCategory.get(item.category) ?? 0) + 1);
  }

  /** @param {string} label @param {string} [modifier] */
  const chip = (label, modifier = '') =>
    `<span class="scan-context-label${modifier ? ` scan-context-label--${modifier}` : ''}">${esc(label)}</span>`;

  const tables = groups
    .map((g) => {
      const caption =
        groups.length > 1 && g.source ? `<caption>${esc(`${g.source.owner}/${g.source.repo}`)}</caption>` : '';
      const rows = (g.categories ?? [])
        .map(
          (c) => `
            <tr>
              <th scope="row">${esc(c.name)}</th>
              <td>${(c.labels ?? []).map((l) => chip(l)).join(' ')}</td>
              <td class="scan-scope-table__count">${countByCategory.get(c.name) ?? 0}</td>
            </tr>`
        )
        .join('');
      return `
        <table class="scan-scope-table">
          ${caption}
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Team labels <span class="scan-scope__muted">(any one matches)</span></th>
              <th scope="col" class="scan-scope-table__count">In queue</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    })
    .join('');

  /** @param {string} label @param {string} contentHtml */
  const metaRow = (label, contentHtml) =>
    `<div class="scan-scope__meta"><span class="scan-scope__meta-label">${esc(label)}</span><span class="scan-scope__meta-value">${contentHtml}</span></div>`;

  const meta = [
    metaRow(
      'Release notes',
      `${releaseLabels.map((l) => chip(l.replace('release_note:', ''), 'release')).join(' ')}
       <span class="scan-scope__muted">PR needs at least one</span>`
    ),
    excludeLabels.length
      ? metaRow('Excluded labels', excludeLabels.map((l) => chip(l, 'exclude')).join(' '))
      : '',
    excludeTitles.length
      ? metaRow(
          'Excluded titles',
          excludeTitles.map((p) => `<code class="scan-scope__pattern">${esc(p)}</code>`).join(' ')
        )
      : '',
  ].join('');

  bodyEl.innerHTML = `
    <p class="scan-scope__note">
      A PR is included when it has one of a category's team labels <strong>and</strong> one of the release note labels,
      merged after <strong>Merged since</strong>, and isn't excluded.
    </p>
    ${tables}
    <div class="scan-scope__meta-list">${meta}</div>
  `;

  if (section) section.style.display = '';
}

function bindScanContextCollapse() {
  const details = document.getElementById('scan-context-details');
  if (!details || details.dataset.bound) return;
  details.dataset.bound = '1';
  const hint = details.querySelector('.scan-context-summary-hint');
  const syncHint = () => {
    if (hint) hint.textContent = details.open ? 'Hide categories and labels' : 'Show categories and labels';
  };
  details.open = sessionStorage.getItem('scan-context-open') === '1';
  details.addEventListener('toggle', () => {
    sessionStorage.setItem('scan-context-open', details.open ? '1' : '0');
    syncHint();
  });
  syncHint();
}

function enrichPrompt(pending) {
  const items = `${pending} item${pending === 1 ? '' : 's'}`;
  return (
    `/docs-quest-scanner Enrich the current queue only (${items} still need it). ` +
    `Skip Step 1 (don't run the scanner) and Step 3 (the review UI is already running at http://localhost:3847).`
  );
}

function openEnrichDialog() {
  const dialog = document.getElementById('enrich-dialog');
  if (!dialog) return;
  const pending = pendingEnrichmentCount();
  const total = state.queue.items?.length ?? 0;
  const lead = document.getElementById('enrich-dialog-lead');
  if (lead) {
    lead.textContent = `${pending} of ${total} items haven't been enriched yet.`;
  }
  const prompt = document.getElementById('enrich-dialog-prompt');
  if (prompt) prompt.value = enrichPrompt(pending);
  dialog.showModal();
}

async function copyEnrichPrompt() {
  const prompt = document.getElementById('enrich-dialog-prompt');
  if (!prompt) return;
  try {
    await navigator.clipboard.writeText(prompt.value);
    showToast('Prompt copied. Paste it into Claude Code.', 'success');
  } catch {
    prompt.select();
    showToast('Copy failed. The prompt is selected; press Cmd+C to copy it.', 'error');
  }
}

function bindScanScopeActions() {
  document.getElementById('btn-run-scan')?.addEventListener('click', () => void triggerScan());
  document.getElementById('btn-enrich')?.addEventListener('click', openEnrichDialog);
  document.getElementById('btn-enrich-copy')?.addEventListener('click', () => void copyEnrichPrompt());
  const close = () => document.getElementById('enrich-dialog')?.close();
  document.getElementById('btn-close-enrich')?.addEventListener('click', close);
  document.getElementById('btn-enrich-cancel')?.addEventListener('click', close);
}

/** @param {QueueItem[]} items */
function filterQueueItemsByAssessment(items) {
  if (state.queueFilter === 'all') return items;
  const allowed = new Set(state.queueFilter.split(','));
  return items.filter((i) => allowed.has(i.assessment?.needsDocs ?? 'check'));
}

/** @param {string} a @param {string} b */
function compareStackMinors(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 2; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** @param {QueueItem} item */
function itemStackMinors(item) {
  if (item.stackMinors?.length) return item.stackMinors;
  return allVersions(item).map((v) => {
    const m = v.match(/^v?(\d+)\.(\d+)/i);
    return m ? `${m[1]}.${m[2]}` : null;
  }).filter(Boolean);
}

/** @param {QueueItem[]} items */
function filterQueueItemsByVersion(items) {
  const vf = state.queueVersionFilter;
  if (vf === 'all') return items;
  const focus = state.queue.filterMeta?.focusStackReleases ?? state.config?.focusStackReleases ?? [];
  if (vf === 'focus') {
    const focusSet = new Set(focus);
    return items.filter((i) => itemStackMinors(i).some((mm) => focusSet.has(mm)));
  }
  return items.filter((i) => itemStackMinors(i).includes(vf));
}

function mergeFilterOpts() {
  return {
    customFrom: state.queueMergeFrom,
    customTo: state.queueMergeTo,
    sinceScanAt:
      state.queue?.filterMeta?.lastScanAt ??
      state.queue?.scannedAt ??
      state.lastRun?.lastRunDate ??
      null,
  };
}

/** @param {QueueItem[]} items */
function filterQueueItemsByMergeDate(items) {
  const mf = state.queueMergeFilter;
  if (mf === 'all' || !mergeFilterMod) return items;
  const opts = mergeFilterOpts();
  return items.filter((item) => mergeFilterMod.itemMatchesMergeFilter(item, mf, opts));
}

function configCategoryNames() {
  const cfg = state.config;
  if (!cfg) return [];
  const names = [];
  if (Array.isArray(cfg.repos)) {
    for (const g of cfg.repos) {
      for (const c of g.categories ?? []) {
        if (c.name) names.push(c.name);
      }
    }
  }
  for (const c of cfg.categories ?? []) {
    if (c.name) names.push(c.name);
  }
  return [...new Set(names)];
}

/** @param {QueueItem} item */
function itemCategoryNames(item) {
  const names = [item.category, ...(item.alsoAppliesTo ?? [])].filter(Boolean);
  return [...new Set(names)];
}

/** @param {QueueItem[]} items */
function filterQueueItemsByCategory(items) {
  const cf = state.queueCategoryFilter;
  if (cf === 'all') return items;
  const focus =
    state.queue.filterMeta?.focusCategories ?? state.config?.focusCategories ?? [];
  if (cf === 'focus') {
    const focusSet = new Set(focus);
    return items.filter((i) => itemCategoryNames(i).some((n) => focusSet.has(n)));
  }
  return items.filter((i) => itemCategoryNames(i).includes(cf));
}

/** @param {QueueItem[]} items */
function filterQueueItemsByPriority(items) {
  const pf = state.queuePriorityFilter;
  if (pf === 'all') return items;
  if (pf === 'unrated') {
    return items.filter((i) => !i.triagePriorityLevel);
  }
  const allowed = new Set(pf.split(','));
  return items.filter(
    (i) => i.triagePriorityLevel && allowed.has(i.triagePriorityLevel.toLowerCase())
  );
}

const PRIORITY_SORT = { P0: 0, P1: 1, P2: 2, P3: 3 };

/** @param {QueueItem[]} items */
function sortQueueItemsByPriority(items) {
  return [...items].sort((a, b) => {
    const pa = PRIORITY_SORT[a.triagePriorityLevel] ?? 9;
    const pb = PRIORITY_SORT[b.triagePriorityLevel] ?? 9;
    if (pa !== pb) return pa - pb;
    return (b.assessment?.confidence ?? 0) - (a.assessment?.confidence ?? 0);
  });
}

/** @param {QueueItem[]} items */
function filterQueueItemsByDocWork(items) {
  if (state.queueDocWorkFilter === 'all') return items;
  if (state.queueDocWorkFilter === 'api-update') {
    return items.filter((i) => {
      if (i.docSurface !== 'api-only') return false;
      const kind = i.docWorkKind ?? 'unknown';
      return kind === 'update' || kind === 'unknown';
    });
  }
  return items.filter((i) => (i.docWorkKind ?? 'unknown') === state.queueDocWorkFilter);
}

/** @param {QueueItem[]} items */
function pruneQueueSelection() {
  const ids = new Set((state.queue.items ?? []).map((i) => i.id));
  for (const id of state.selectedQueueIds) {
    if (!ids.has(id)) state.selectedQueueIds.delete(id);
  }
}

/** @type {Record<string, { reason?: string }>} */
const BULK_ACTIONS = {
  accept: {},
  'skip-no-docs': { reason: 'no docs needed' },
  'skip-already-tracked': { reason: 'already tracked' },
  'skip-owned-by-dev': { reason: 'owned by dev' },
  'skip-release-notes-only': { reason: 'release notes only' },
  'skip-not-my-area': { reason: 'not my area' },
};

function bulkApplyButtonLabel() {
  const n = state.selectedQueueIds.size;
  const sel = document.getElementById('bulk-action-select');
  const action = sel?.value ?? 'accept';
  if (n === 0) return 'Apply';
  if (action === 'accept') {
    return n === 1 ? 'Accept quest' : `Accept ${n} quests`;
  }
  const optionText = sel?.selectedOptions?.[0]?.textContent?.trim() ?? 'Skip';
  return n === 1 ? optionText : `${optionText} (${n})`;
}

function updateBulkBar() {
  const countEl = document.getElementById('queue-bulk-count');
  const applyBtn = document.getElementById('btn-bulk-apply');
  const n = state.selectedQueueIds.size;
  if (countEl) countEl.textContent = n === 1 ? '1 selected' : `${n} selected`;
  if (applyBtn) {
    applyBtn.disabled = n === 0 || state.bulkBusy;
    applyBtn.textContent = bulkApplyButtonLabel();
  }
  const applyTip = document.getElementById('bulk-apply-tip-wrap');
  if (applyTip) applyTip.dataset.tip = bulkApplyTooltip(n);
  setBulkBarControlsDisabled(state.bulkBusy);
}

function bulkApplyTooltip(n) {
  if (n === 0) return 'Select at least one item first';
  const items = `${n} item${n === 1 ? '' : 's'}`;
  const action = document.getElementById('bulk-action-select')?.value ?? 'accept';
  if (action === 'accept') {
    return `Creates a GitHub issue for each of the ${items}, using each card's title, body, and target repo. You'll confirm first.`;
  }
  const reason = BULK_ACTIONS[action]?.reason ?? action;
  return `Removes the ${items} from the queue and records "${reason}" in History. You'll confirm first.`;
}

/** @param {boolean} disabled */
function setBulkBarControlsDisabled(disabled) {
  for (const id of [
    'btn-bulk-select-visible',
    'btn-bulk-clear',
    'bulk-action-select',
    'btn-bulk-apply',
  ]) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (id === 'btn-bulk-apply') {
      el.disabled = disabled || state.selectedQueueIds.size === 0;
    } else {
      el.disabled = disabled;
    }
  }
}

/** @param {number} total @param {string} verb e.g. "Creating issues" */
function beginBulkProgress(total, verb) {
  state.bulkBusy = true;
  setBulkBarControlsDisabled(true);
  const wrap = document.getElementById('queue-bulk-progress');
  if (wrap) {
    wrap.hidden = false;
    wrap.setAttribute('aria-busy', 'true');
  }
  setBulkProgress(0, total, verb);
}

/** @param {number} completed @param {number} total @param {string} [verb] */
function setBulkProgress(completed, total, verb) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const fill = document.getElementById('queue-bulk-progress-fill');
  const label = document.getElementById('queue-bulk-progress-label');
  if (fill) fill.style.width = `${pct}%`;
  const action = verb ? `${verb}… ` : '';
  if (label) label.textContent = `${action}${completed} / ${total}`;
}

function endBulkProgress() {
  state.bulkBusy = false;
  const wrap = document.getElementById('queue-bulk-progress');
  if (wrap) {
    wrap.hidden = true;
    wrap.removeAttribute('aria-busy');
  }
  const fill = document.getElementById('queue-bulk-progress-fill');
  if (fill) fill.style.width = '0%';
  updateBulkBar();
}

function setItemSelected(itemId, selected) {
  if (selected) state.selectedQueueIds.add(itemId);
  else state.selectedQueueIds.delete(itemId);
  updateBulkBar();
}

function selectAllVisibleQueueItems() {
  const visible = applyQueueFilters(state.queue.items ?? []);
  for (const item of visible) state.selectedQueueIds.add(item.id);
  renderQueue();
}

function clearQueueSelection() {
  state.selectedQueueIds.clear();
  renderQueue();
}

function categoryGroupAllSelected(itemIds) {
  return itemIds.length > 0 && itemIds.every((id) => state.selectedQueueIds.has(id));
}

function categoryGroupSomeSelected(itemIds) {
  return itemIds.some((id) => state.selectedQueueIds.has(id));
}

function toggleCategoryGroupSelection(itemIds, selected) {
  for (const id of itemIds) {
    if (selected) state.selectedQueueIds.add(id);
    else state.selectedQueueIds.delete(id);
  }
  renderQueue();
}

function bindBulkActions() {
  document.getElementById('btn-bulk-select-visible')?.addEventListener('click', selectAllVisibleQueueItems);
  document.getElementById('btn-bulk-clear')?.addEventListener('click', clearQueueSelection);
  document.getElementById('btn-bulk-apply')?.addEventListener('click', () => void runBulkAction());
  document.getElementById('bulk-action-select')?.addEventListener('change', updateBulkBar);
}

function applyQueueFilters(items) {
  return filterQueueItemsByPriority(
    filterQueueItemsByDocWork(
      filterQueueItemsByCategory(
        filterQueueItemsByMergeDate(
          filterQueueItemsByVersion(filterQueueItemsByAssessment(items))
        )
      )
    )
  );
}

function mergeFilterIsActive() {
  if (state.queueMergeFilter === 'all') return false;
  if (state.queueMergeFilter === 'custom') {
    return Boolean(state.queueMergeFrom.trim() || state.queueMergeTo.trim());
  }
  return true;
}

function activeQueueFiltersCount() {
  let n = 0;
  if (state.queueFilter !== 'all') n++;
  if (state.queueVersionFilter !== 'all') n++;
  if (mergeFilterIsActive()) n++;
  if (state.queueDocWorkFilter !== 'all') n++;
  if (state.queueCategoryFilter !== 'all') n++;
  if (state.queuePriorityFilter !== 'all') n++;
  return n;
}

const QUEUE_FILTER_SESSION_KEYS = [
  'queue-filter',
  'queue-version-filter',
  'queue-merge-filter',
  'queue-doc-work-filter',
  'queue-category-filter',
  'queue-priority-filter',
  'queue-merge-from',
  'queue-merge-to',
];

/** Clear filter sessionStorage and set every filter to All. */
function resetQueueFilters() {
  for (const key of QUEUE_FILTER_SESSION_KEYS) {
    sessionStorage.removeItem(key);
  }
  state.queueFilter = 'all';
  state.queueVersionFilter = 'all';
  state.queueMergeFilter = 'all';
  state.queueDocWorkFilter = 'all';
  state.queueCategoryFilter = 'all';
  state.queuePriorityFilter = 'all';
  state.queueMergeFrom = '';
  state.queueMergeTo = '';
  for (const [storageKey, value] of [
    ['queue-filter', 'all'],
    ['queue-version-filter', 'all'],
    ['queue-merge-filter', 'all'],
    ['queue-doc-work-filter', 'all'],
    ['queue-category-filter', 'all'],
    ['queue-priority-filter', 'all'],
  ]) {
    sessionStorage.setItem(storageKey, value);
  }
  populateQueueVersionFilterOptions();
  populateQueueMergeFilterOptions();
  populateQueueCategoryFilterOptions();
  populateQueuePriorityFilterOptions();
  syncQueueFilterControls();
  renderQueue();
}

function applyDefaultQueueFiltersIfUnset() {
  const defs = state.config?.defaultQueueFilters;
  if (!defs) return;

  /** @param {string} storageKey @param {string} field @param {string | undefined} value */
  const apply = (storageKey, field, value) => {
    if (sessionStorage.getItem(storageKey) != null || value == null) return;
    state[field] = value;
    sessionStorage.setItem(storageKey, value);
  };

  apply('queue-filter', 'queueFilter', defs.assessment);
  apply('queue-version-filter', 'queueVersionFilter', defs.version);
  apply('queue-merge-filter', 'queueMergeFilter', defs.mergeRange);
  apply('queue-category-filter', 'queueCategoryFilter', defs.category);
  apply('queue-doc-work-filter', 'queueDocWorkFilter', defs.docWork);
  apply('queue-priority-filter', 'queuePriorityFilter', defs.priority);
  if (sessionStorage.getItem('queue-merge-from') == null && defs.mergeFrom) {
    state.queueMergeFrom = defs.mergeFrom;
    sessionStorage.setItem('queue-merge-from', defs.mergeFrom);
  }
  if (sessionStorage.getItem('queue-merge-to') == null && defs.mergeTo) {
    state.queueMergeTo = defs.mergeTo;
    sessionStorage.setItem('queue-merge-to', defs.mergeTo);
  }
}

function syncQueueFilterControls() {
  for (const [key, field] of [
    ['queue-filter', 'queueFilter'],
    ['queue-version-filter', 'queueVersionFilter'],
    ['queue-merge-filter', 'queueMergeFilter'],
    ['queue-doc-work-filter', 'queueDocWorkFilter'],
    ['queue-category-filter', 'queueCategoryFilter'],
    ['queue-priority-filter', 'queuePriorityFilter'],
  ]) {
    const el = document.getElementById(key);
    if (!el) continue;
    const val = state[field];
    if ([...el.options].some((o) => o.value === val)) el.value = val;
  }
  const fromEl = document.getElementById('queue-merge-from');
  const toEl = document.getElementById('queue-merge-to');
  if (fromEl) fromEl.value = state.queueMergeFrom || '';
  if (toEl) toEl.value = state.queueMergeTo || '';
  syncMergeCustomRow();
}

function sinceLastScanOptionLabel() {
  const raw =
    state.queue?.filterMeta?.lastScanAt ??
    state.queue?.scannedAt ??
    state.lastRun?.lastRunDate;
  if (!raw) return 'Since last scan (none yet)';
  return `Since last scan (${formatDate(raw)})`;
}

function populateQueueMergeFilterOptions() {
  const sel = document.getElementById('queue-merge-filter');
  if (!sel) return;
  const prev = state.queueMergeFilter;
  const items = state.queue.items ?? [];
  const opts = mergeFilterOpts();

  const count = (preset) =>
    mergeFilterMod ? mergeFilterMod.countItemsForMergePreset(items, preset, opts) : items.length;

  const presets = [
    ['all', `All dates (${items.length})`],
    ['7d', `Last 7 days (${count('7d')})`],
    ['30d', `Last 30 days (${count('30d')})`],
    ['90d', `Last 90 days (${count('90d')})`],
    ['since-scan', `${sinceLastScanOptionLabel()} (${count('since-scan')})`],
    ['custom', 'Custom range…'],
  ];

  sel.innerHTML = presets
    .map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`)
    .join('');

  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  else {
    state.queueMergeFilter = 'all';
    sel.value = 'all';
    sessionStorage.setItem('queue-merge-filter', 'all');
  }
}

function syncMergeCustomRow() {
  const row = document.getElementById('queue-merge-custom');
  if (!row) return;
  row.hidden = state.queueMergeFilter !== 'custom';
}

function populateQueueCategoryFilterOptions() {
  const sel = document.getElementById('queue-category-filter');
  if (!sel) return;
  const prev = state.queueCategoryFilter;
  const names = new Set(configCategoryNames());
  for (const item of state.queue.items ?? []) {
    for (const n of itemCategoryNames(item)) names.add(n);
  }
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  const focus = state.queue.filterMeta?.focusCategories ?? state.config?.focusCategories ?? [];

  let html = '<option value="all">All categories</option>';
  if (focus.length) {
    const label =
      focus.length === 1
        ? `Focus: ${focus[0]} (config)`
        : `Focus: ${focus.join(', ')} (config)`;
    html += `<option value="focus">${esc(label)}</option>`;
  }
  for (const name of sorted) {
    const isFocus = focus.includes(name);
    html += `<option value="${esc(name)}">${esc(name)}${isFocus ? ' ★' : ''}</option>`;
  }
  sel.innerHTML = html;
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  else if (focus.length && prev === 'focus') sel.value = 'focus';
  else {
    state.queueCategoryFilter = 'all';
    sel.value = 'all';
  }
}

/** Count items per priority tier (uses server-derived `triagePriorityLevel` on each item). */
function priorityTierCounts() {
  /** @type {Record<string, number>} */
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0, unrated: 0 };
  for (const item of state.queue.items ?? []) {
    const level = item.triagePriorityLevel;
    if (!level) counts.unrated += 1;
    else if (level in counts) counts[level] += 1;
  }
  return counts;
}

function populateQueuePriorityFilterOptions() {
  const sel = document.getElementById('queue-priority-filter');
  if (!sel) return;
  const prev = state.queuePriorityFilter;
  const c = priorityTierCounts();
  const p01 = c.P0 + c.P1;

  const options = [
    ['all', 'All'],
    ['p0,p1', `P0 + P1 (${p01})`],
    ['p0', `P0 (${c.P0})`],
    ['p1', `P1 (${c.P1})`],
    ['p2', `P2 (${c.P2})`],
    ['p3', `P3 (${c.P3})`],
    ['unrated', `Unrated (${c.unrated})`],
  ];

  sel.innerHTML = options
    .map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`)
    .join('');

  if ([...sel.options].some((o) => o.value === prev)) {
    sel.value = prev;
  } else {
    state.queuePriorityFilter = 'all';
    sel.value = 'all';
    sessionStorage.setItem('queue-priority-filter', 'all');
  }
}

function populateQueueVersionFilterOptions() {
  const sel = document.getElementById('queue-version-filter');
  if (!sel) return;
  const prev = state.queueVersionFilter;
  const minors = new Set();
  for (const item of state.queue.items ?? []) {
    for (const mm of itemStackMinors(item)) minors.add(mm);
  }
  const sorted = [...minors].sort(compareStackMinors).reverse();
  const focus = state.queue.filterMeta?.focusStackReleases ?? state.config?.focusStackReleases ?? [];
  const focusSorted = [...new Set(focus)].sort(compareStackMinors).reverse();

  let html = '<option value="all">All versions</option>';
  if (focusSorted.length) {
    const auto = state.queue.filterMeta?.focusAuto;
    const suffix = auto ? 'auto' : 'config';
    const label = focusSorted.length === 1
      ? `Focus: ${focusSorted[0]} (${suffix})`
      : `Focus: ${focusSorted.join(', ')} (${suffix})`;
    html += `<option value="focus">${esc(label)}</option>`;
  }
  for (const mm of sorted) {
    const isFocus = focus.includes(mm);
    html += `<option value="${esc(mm)}">${esc(mm)}${isFocus ? ' ★' : ''}</option>`;
  }
  sel.innerHTML = html;
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  else if (focusSorted.length && prev === 'focus') sel.value = 'focus';
  else {
    state.queueVersionFilter = 'all';
    sel.value = 'all';
  }
}

function docWorkBadge(item) {
  const parts = [];
  const estimateNote = ' This is an estimate from the PR until enrichment confirms it.';
  if (item.docSurface === 'api-only') {
    const heuristic = item.docSurfaceSource === 'heuristic';
    const tip = `The doc work is in the API reference (generated from OpenAPI), not in guides.${heuristic ? estimateNote : ''}`;
    parts.push(
      `<span class="doc-work-badge doc-work-badge--api${heuristic ? ' doc-work-badge--heuristic' : ''}"${tipAttr(tip)}>API ref${heuristic ? ' (estimate)' : ''}</span>`
    );
  }
  const kind = item.docWorkKind;
  if (kind && kind !== 'unknown') {
    const labels = { new: 'New content', update: 'Update existing' };
    const meanings = {
      new: 'Needs a new page or section.',
      update: 'Needs changes to pages that already exist.',
    };
    const heuristic = item.docWorkKindSource === 'heuristic';
    const tip = `${meanings[kind] ?? ''}${heuristic ? estimateNote : ''}`.trim();
    parts.push(
      `<span class="doc-work-badge${heuristic ? ' doc-work-badge--heuristic' : ''}"${tipAttr(tip)}>${esc(labels[kind] ?? kind)}${heuristic ? ' (estimate)' : ''}</span>`
    );
  }
  return parts.join('');
}

function priorityBadge(item) {
  const level = item.triagePriorityLevel;
  if (!level) return '';
  const heuristic = item.triagePrioritySource === 'heuristic';
  const est = heuristic ? ' (estimate)' : '';
  const cls = heuristic ? ' priority-badge--heuristic' : '';
  const tip = heuristic
    ? `Priority ${level}, estimated from the release note label and assessment until enrichment sets one. P0 is most urgent.`
    : `Priority ${item.triagePriorityLabel ?? level}, set by enrichment. This becomes the issue's project Priority.`;
  return `<span class="priority-badge${cls}"${tipAttr(tip)}>${esc(level)}${esc(est)}</span>`;
}

function renderTabCounts() {
  const items = state.queue.items;
  const yes = items.filter((i) => i.assessment.needsDocs === 'yes').length;
  const check = items.filter((i) => i.assessment.needsDocs === 'check').length;
  const no = items.filter((i) => i.assessment.needsDocs === 'no').length;

  const queueEl = document.getElementById('tab-queue-count');
  const parts = [];
  if (yes > 0) parts.push(`${yes} needs docs`);
  if (check > 0) parts.push(`${check} to check`);
  if (no > 0) parts.push(`${no} no docs`);
  queueEl.textContent = parts.length ? parts.join(' · ') : '0';

  document.getElementById('tab-history-count').textContent = String(state.history.entries.length);
}

function renderQueue() {
  const container = document.getElementById('queue-container');
  const empty = document.getElementById('queue-empty');
  const filterHint = document.getElementById('queue-filter-hint');
  const visibleItems = applyQueueFilters(state.queue.items);

  const footer = document.getElementById('complete-scan-footer');
  const hasActiveScan = !!state.queue.scannedAt;

  if (filterHint) {
    const total = state.queue.items.length;
    if (total === 0) {
      filterHint.textContent = '';
    } else if (activeQueueFiltersCount() === 0) {
      filterHint.textContent = total === 1 ? '1 item' : `${total} items`;
    } else {
      filterHint.textContent = `Showing ${visibleItems.length} of ${total} items`;
    }
  }

  if (state.queue.items.length === 0) {
    container.innerHTML = '';
    empty.style.display = '';
    if (hasActiveScan) {
      document.getElementById('queue-empty-heading').textContent = 'All quests resolved!';
      document.getElementById('queue-empty-message').textContent = 'Every PR has been triaged. Mark the scan complete to log your progress.';
      document.getElementById('queue-empty-hint').style.display = 'none';
    } else {
      document.getElementById('queue-empty-heading').textContent = 'Your quest log is empty';
      document.getElementById('queue-empty-message').textContent = 'No PRs awaiting triage. Run a scan to discover new quests.';
      document.getElementById('queue-empty-hint').style.display = '';
    }
    if (footer) footer.style.display = hasActiveScan ? '' : 'none';
    return;
  }

  if (visibleItems.length === 0) {
    container.innerHTML = `
      <div class="blankslate">
        <h3 class="blankslate-heading">No items match this filter</h3>
        <p class="color-fg-muted text-small">Relax <strong>Assessment</strong>, <strong>Stack release</strong>, <strong>Doc work</strong>, <strong>Category</strong>, or <strong>Priority</strong>. Priority counts are heuristic until enrichment sets <code>triagePriority</code>; <strong>P0 + P1</strong> is narrow — try P2 or All.</p>
      </div>`;
    empty.style.display = 'none';
    if (footer) footer.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  if (footer) footer.style.display = 'none';

  // Group by category
  const grouped = groupByCategory(visibleItems);
  const labelsByCategory = new Map(
    (state.config ? scanScopeGroups(state.config) : [])
      .flatMap((g) => g.categories ?? [])
      .map((c) => [c.name, c.labels ?? []])
  );
  let html = '';

  for (const [category, items] of grouped) {
    const sortedItems = sortQueueItemsByPriority(items);
    const itemIds = sortedItems.map((i) => i.id);
    const allSel = categoryGroupAllSelected(itemIds);
    const someSel = !allSel && categoryGroupSomeSelected(itemIds);
    const yes = sortedItems.filter((i) => i.assessment.needsDocs === 'yes').length;
    const check = sortedItems.filter((i) => i.assessment.needsDocs === 'check').length;
    const no = sortedItems.filter((i) => i.assessment.needsDocs === 'no').length;
    html += `
      <div class="category-group" data-category-group="${esc(category)}">
        <div class="category-header">
          <label class="category-select-all"${tipAttr('Select every item shown in this category for a bulk action')}>
            <input type="checkbox" class="category-select-all-input" aria-label="Select all in ${esc(category)}" data-item-ids="${esc(itemIds.join(','))}"${allSel ? ' checked' : ''}${someSel ? ' data-indeterminate="1"' : ''} />
          </label>
          <h3${labelsByCategory.get(category)?.length ? ` class="tip-help"${tipAttr(`PRs with any of these labels: ${labelsByCategory.get(category).join(', ')}`)}` : ''}>${esc(category)}</h3>
          <div class="category-pills">
            ${yes > 0 ? `<span class="pill pill-yes"${tipAttr('The assessment found a documentation gap in these PRs')}>${yes} needs docs</span>` : ''}
            ${check > 0 ? `<span class="pill pill-check"${tipAttr("The assessment isn't sure these need docs. Review them to decide.")}>${check} to check</span>` : ''}
            ${no > 0 ? `<span class="pill pill-no"${tipAttr('The assessment says no docs are needed. Skim them and skip.')}>${no} no docs</span>` : ''}
          </div>
        </div>
        ${sortedItems.map((item) => renderCard(item)).join('')}
      </div>
    `;
  }

  // Skipped items — only show dismissals from the current scan period
  const scanDate = state.queue.scannedAt ? new Date(state.queue.scannedAt) : null;
  const skipped = scanDate
    ? state.history.entries.filter((e) => e.decision === 'dismissed' && new Date(e.timestamp) >= scanDate)
    : [];
  if (skipped.length > 0) {
    html += `
      <div class="skipped-section">
        <details>
          <summary class="skipped-summary">
            <span class="tip-label"${tipAttr('Items you skipped since the latest scan. Restore undoes a skip so the PR returns on the next scan.')}>Skipped</span>
            <span class="Counter ml-2">${skipped.length}</span>
          </summary>
          <div class="skipped-list">
            ${skipped.map((entry) => `
              <div class="skipped-item">
                <span class="skipped-title">${esc(entry.title || entry.prNumbers.map((n) => '#' + n).join(', '))}</span>
                ${entry.reason ? `<span class="Label Label--secondary ml-2" style="font-size:11px">${esc(entry.reason)}</span>` : ''}
                <button class="btn btn-sm btn-outline" data-action="unskip" data-prs="${entry.prNumbers.join(',')}"${tipAttr('Removes this skip from History. The PR returns to the queue on the next scan.')}>Restore</button>
              </div>
            `).join('')}
          </div>
        </details>
      </div>
    `;
  }

  container.innerHTML = html;
  bindCardEvents();
  updateBulkBar();
  container.querySelectorAll('.category-select-all-input').forEach((input) => {
    if (input.dataset.indeterminate === '1') input.indeterminate = true;
    input.addEventListener('change', () => {
      const ids = (input.dataset.itemIds ?? '').split(',').filter(Boolean);
      toggleCategoryGroupSelection(ids, input.checked);
    });
  });

  // Bind unskip buttons
  container.querySelectorAll('[data-action="unskip"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const prNumbers = btn.dataset.prs.split(',').map(Number);
      await undoDismiss(prNumbers);
    });
  });
}

function effortBadge(tag) {
  if (!tag) return '';
  const config = {
    'quick-fix': { icon: `<svg class="octicon" viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.835c1.497 0 2.154 1.921.928 2.715l-6.862 4.44A1.516 1.516 0 0 1 4.879 10.857L6.585 7.5H3.75c-1.497 0-2.154-1.921-.928-2.715L9.504.43Z"/></svg>`, label: 'Quick fix', cls: 'effort-badge--quick' },
    'update': { icon: `<svg class="octicon" viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/></svg>`, label: 'Update', cls: 'effort-badge--update' },
    'new-content': { icon: `<svg class="octicon" viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg>`, label: 'New content', cls: 'effort-badge--new' },
  };
  const c = config[tag] ?? { icon: '', label: tag, cls: '' };
  const tips = {
    'quick-fix': 'Estimated effort: a small correction to an existing page. Sets the issue Size.',
    update: 'Estimated effort: a moderate update to existing pages. Sets the issue Size.',
    'new-content': 'Estimated effort: new pages or sections. Sets the issue Size.',
  };
  return `<span class="effort-badge ${c.cls}"${tipAttr(tips[tag] ?? 'Estimated effort from enrichment')}>${c.icon} ${c.label}</span>`;
}

/** Unique release_note:* label values across an item's PRs, e.g. ["fix", "skip"]. */
function releaseNoteKinds(item) {
  const kinds = new Set();
  for (const pr of item.prs ?? []) {
    for (const label of pr.labels ?? []) {
      if (label.toLowerCase().startsWith('release_note:')) {
        kinds.add(label.slice('release_note:'.length).toLowerCase());
      }
    }
  }
  return [...kinds].sort();
}

function releaseNoteBadges(item) {
  return releaseNoteKinds(item)
    .map((k) => `<span class="rn-badge rn-badge--${esc(k)}"${tipAttr(`The PR's release_note:${k} label, set by the product team`)}>${esc(k)}</span>`)
    .join('');
}

function renderCard(item) {
  const badge = badgeClass(item.assessment.needsDocs);
  const badgeLabel = {
    yes: 'Needs docs',
    check: 'Check',
    no: 'No docs needed',
  }[item.assessment.needsDocs];

  const title = item.userEdits?.title ?? item.suggestedTitle;
  const avail = availabilityBadge(item);
  const confidence = item.assessment.confidence != null ? Math.round(item.assessment.confidence * 100) : null;
  const confStr = confidence != null ? ` · ${confidence}%` : '';

  const confTip = confidence != null ? ` ${confidence}% is how confident the assessment is.` : '';
  const assessmentTip = item.assessment.prefiltered
    ? `No docs needed: filtered out automatically before AI analysis (rule: ${item.assessment.prefiltered}).`
    : {
        yes: `Needs docs: the assessment found a documentation gap.${confTip}`,
        check: `Check: unclear whether docs are needed, so a writer should decide.${confTip}`,
        no: `No docs needed: the assessment found nothing to document.${confTip}`,
      }[item.assessment.needsDocs] ?? '';

  const selected = state.selectedQueueIds.has(item.id);
  return `
    <div class="triage-card" data-id="${item.id}">
      <div class="triage-card-header" data-action="toggle">
        <input type="checkbox" class="triage-select" data-item="${item.id}" aria-label="Select for bulk action"${tipAttr('Select for a bulk action')}${selected ? ' checked' : ''} />
        <svg class="triage-card-chevron octicon" viewBox="0 0 16 16" width="16" height="16">
          <path fill="currentColor" d="m6.427 4.427 3.396 3.396a.25.25 0 0 1 0 .354l-3.396 3.396A.25.25 0 0 1 6 11.396V4.604a.25.25 0 0 1 .427-.177Z"/>
        </svg>
        <span class="triage-card-title">${esc(title)}</span>
        <div class="triage-card-meta">
          <span class="docs-badge ${badge}"${tipAttr(assessmentTip)}>${badgeLabel}<span class="docs-badge-conf">${confStr}</span></span>
          ${releaseNoteBadges(item)}
          ${avail ? `<span class="avail-badge"${tipAttr('Where this ships: Stack version from the PR label, and the estimated serverless week')}>${esc(avail)}</span>` : ''}
          ${docWorkBadge(item)}
          ${priorityBadge(item)}
          ${effortBadge(item.assessment.effortTag)}
          ${item.assessment.trackedIn?.length ? `<span class="tracked-badge"${tipAttr('A docs issue already references this PR. Open the card to see it under Tracked in.')}>Already tracked</span>` : ''}
        </div>
      </div>
      <div class="triage-card-body">
        ${renderCardBody(item)}
      </div>
    </div>
  `;
}

/** Build <option>s for the target-repo dropdown from the configured targets. */
function targetRepoOptions(selected) {
  const configured = state.queue?.targetOptions?.length
    ? state.queue.targetOptions
    : ['elastic/docs-content', 'elastic/docs-content-internal'];
  // Ensure the current value is always present and selected, even if not configured.
  const options = [...new Set([selected, ...configured])].filter(Boolean);
  return options
    .map((t) => `<option value="${esc(t)}" ${sel(selected, t)}>${esc(t.split('/')[1] || t)}</option>`)
    .join('');
}

function renderCardBody(item) {
  const pencil = `<svg class="octicon" viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/></svg>`;
  const edits = item.userEdits ?? {};
  const title = edits.title ?? item.suggestedTitle;
  // Default target comes from the item's resolved repo group (server-provided),
  // falling back to the legacy single targetRepo if present.
  const targetRepo = edits.targetRepo
    ?? item.resolvedTarget
    ?? (state.config?.targetRepo ? `${state.config.targetRepo.owner}/${state.config.targetRepo.repo}` : 'elastic/docs-content');

  const versions = allVersions(item);
  const slWeek = effectiveServerless(item);
  const featureStatus = edits.featureStatus ?? item.assessment.featureStatus;
  const featureFlag = edits.featureFlag ?? item.assessment.featureFlag;

  return `
    <!-- Context table -->
    <table class="card-info-table">
      <tr>
        <td class="card-info-label">Pull requests</td>
        <td>
          <div class="pr-list-compact">
            ${item.prs.map((pr) => `
              <a class="pr-chip" href="${esc(pr.url)}" target="_blank" rel="noopener">
                <span class="pr-chip-number">#${pr.number}</span>
                <span class="pr-chip-title">${esc(pr.title)}</span>
                <span class="pr-chip-author">@${esc(pr.author)}</span>
              </a>
            `).join('')}
            ${item.alsoAppliesTo?.length ? `<span class="also-applies-tag">Also: ${item.alsoAppliesTo.map(c => esc(c)).join(', ')}</span>` : ''}
          </div>
        </td>
      </tr>
      ${item.assessment.trackedIn?.length ? `
      <tr>
        <td class="card-info-label"><span class="tip-label"${tipAttr('Existing docs issues that reference this PR. If one covers the work, use Skip – already tracked.')}>Tracked in</span></td>
        <td>
          <div class="tracked-issues-list">
            ${item.assessment.trackedIn.map(t => `
              <a class="tracked-issue-link" href="${esc(t.url)}" target="_blank" rel="noopener">
                <svg class="octicon" viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0 13 0Z"/></svg>
                #${t.number} ${esc(t.title)}
              </a>
            `).join('')}
          </div>
        </td>
      </tr>` : ''}
      <tr>
        <td class="card-info-label"><span class="tip-label"${tipAttr('Stack versions from the PR labels, the estimated serverless week (merge date plus 7 days, or N/A for Stack-only features), feature status, and any feature flag')}>Availability</span></td>
        <td>
          <div class="avail-items">
            ${versions.map(v => `<span class="avail-tag">${esc(v)}</span>`).join('')}
            ${slWeek ? `<span class="avail-tag avail-tag--sl">${(slWeek === 'N/A' || slWeek.startsWith('TBD')) ? `serverless: ${esc(slWeek)}` : `${esc(slWeek)} (serverless)`}</span>` : ''}
            ${featureStatus ? `<span class="avail-status-badge">${esc(featureStatus)}</span>` : ''}
            ${featureFlag ? `<span class="avail-tag avail-tag--flag">${esc(featureFlag)}</span>` : ''}
          </div>
        </td>
      </tr>
    </table>

    <!-- Issue suggestion -->
    <div class="card-section">
      <div class="card-section-label">Issue suggestion <span class="card-section-hint">· becomes the GitHub issue when you accept. Edit it first if needed.</span></div>
      <div class="issue-block">
        <div class="issue-block-header">
          <button class="btn-edit-inline" data-action="toggle-title-edit" data-item="${item.id}" aria-label="Edit title"${tipAttr('Edit the issue title')}>${pencil}</button>
          <span class="issue-block-title-text" data-title-display="${item.id}">${esc(title)}</span>
          <input class="issue-block-title" data-field="title" data-item="${item.id}"
            value="${esc(title)}" placeholder="Issue title" style="display:none" />
        </div>
        <div class="issue-body-editor">
          <div class="issue-body-tabs">
            <button class="issue-body-tab" data-editor="write" data-item="${item.id}">Write</button>
            <button class="issue-body-tab active" data-editor="preview" data-item="${item.id}">Preview</button>
          </div>
          <textarea class="issue-body-textarea" data-field="body" data-item="${item.id}"
            style="display:none"
            placeholder="Issue body (Markdown)">${esc(edits.body ?? item.suggestedBody)}</textarea>
          <div class="issue-body-preview" data-preview="${item.id}"></div>
        </div>
      </div>
    </div>

    <!-- 5. Actions -->
    <div class="card-actions">
      <div class="create-group">
        <label class="good-first-issue-label"${tipAttr('Adds the good first issue label to the created issue')}>
          <input type="checkbox" data-field="goodFirstIssue" data-item="${item.id}" />
          good first issue
        </label>
        <button class="btn btn-sm btn-primary" data-action="create" data-item="${item.id}"${tipAttr('Creates the GitHub issue in the target repo, links it in the meta issue if one is configured, sets project fields, and removes the card from the queue')}>
          <svg class="octicon mr-1" viewBox="0 0 16 16" width="16" height="16">
            <path fill="currentColor" d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"/>
          </svg>
          Accept quest and create issue
        </button>
      </div>
      <button class="btn btn-sm btn-danger" data-action="dismiss" data-item="${item.id}" data-reason="no docs needed"${tipAttr(skipTip('The change doesn\'t need documentation.'))}>
        Skip – no docs
      </button>
      <button class="btn btn-sm btn-outline" data-action="dismiss" data-item="${item.id}" data-reason="already tracked"${tipAttr(skipTip('An existing docs issue already covers this.'))}>
        Skip – already tracked
      </button>
      <button class="btn btn-sm btn-outline" data-action="dismiss" data-item="${item.id}" data-reason="owned by dev"${tipAttr(skipTip('The product PR already includes the user docs.'))}>
        Skip – owned by dev
      </button>
      <button class="btn btn-sm btn-outline" data-action="dismiss" data-item="${item.id}" data-reason="release notes only"${tipAttr(skipTip('A release note is enough. No other docs are needed.'))}>
        Skip – release notes only
      </button>
      <button class="btn btn-sm btn-outline" data-action="dismiss" data-item="${item.id}" data-reason="not my area"${tipAttr(skipTip('It belongs to another writer or team.'))}>
        Skip – not my area
      </button>
      <div class="target-repo-select">
        <label class="tip-label"${tipAttr('The repo where Accept creates the issue')}>Target:</label>
        <select data-field="targetRepo" data-item="${item.id}">
          ${targetRepoOptions(targetRepo)}
        </select>
      </div>
    </div>
  `;
}

/** @param {string} why */
function skipTip(why) {
  return `${why} Removes the card from the queue and records the reason in History.`;
}

function renderHistory() {
  const container = document.getElementById('history-container');
  const empty = document.getElementById('history-empty');
  const filter = document.getElementById('history-filter').value;

  let entries = [...state.history.entries];
  if (filter !== 'all') {
    entries = entries.filter((e) => e.decision === filter);
  }

  const meta = document.getElementById('history-meta');
  if (meta) {
    const all = state.history.entries;
    const createdCount = all.filter((e) => e.decision === 'created').length;
    const skippedCount = all.filter((e) => e.decision === 'dismissed').length;
    meta.textContent = all.length
      ? `${createdCount} issue${createdCount === 1 ? '' : 's'} created · ${skippedCount} skipped`
      : '';
  }

  if (entries.length === 0) {
    container.innerHTML = '';
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';

  // Group entries by session (scan date), most recent first
  const sessions = new Map();
  for (const entry of entries) {
    const key = entry.session || entry.timestamp.slice(0, 10);
    if (!sessions.has(key)) sessions.set(key, []);
    sessions.get(key).push(entry);
  }

  // Sort sessions: most recent first
  const sortedSessions = [...sessions.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  let html = '';
  for (const [session, sessionEntries] of sortedSessions) {
    const created = sessionEntries.filter((e) => e.decision === 'created').length;
    const skipped = sessionEntries.filter((e) => e.decision === 'dismissed').length;
    const versions = [...new Set(sessionEntries.map((e) => e.version).filter(Boolean))];
    const isFirst = sortedSessions[0][0] === session;

    const stats = [
      created > 0 ? `${created} accepted` : '',
      skipped > 0 ? `${skipped} skipped` : '',
    ].filter(Boolean).join(', ');

    html += `
      <details class="history-session">
        <summary class="history-session-header">
          <span class="history-session-date"${tipAttr('Scan date. Decisions are grouped by the scan they were made in.')}>${esc(session)}</span>
          ${versions.map((v) => `<span class="Label Label--secondary"${tipAttr('Stack version of PRs decided in this scan')}>${esc(v)}</span>`).join(' ')}
          <span class="history-session-stats">${stats}</span>
        </summary>
        <div class="history-session-body">
          ${sessionEntries.map((entry) => renderHistoryEntry(entry)).join('')}
        </div>
      </details>
    `;
  }

  container.innerHTML = html;

  // Bind undo buttons
  container.querySelectorAll('[data-action="undo-dismiss"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const prNumbers = btn.dataset.prs.split(',').map(Number);
      await undoDismiss(prNumbers);
    });
  });
}

function renderHistoryEntry(entry) {
  const isCreated = entry.decision === 'created';
  const icon = isCreated
    ? `<svg class="octicon history-icon history-icon-created" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/></svg>`
    : `<svg class="octicon history-icon history-icon-dismissed" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm9.78-2.22-5.5 5.5a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l5.5-5.5a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"/></svg>`;

  const link = isCreated && entry.issueUrl
    ? `<a href="${esc(entry.issueUrl)}" target="_blank" class="Link--primary">${esc(entry.title || `Issue #${entry.issueNumber}`)}</a>`
    : `<span>${esc(entry.title || entry.prNumbers.map((n) => `#${n}`).join(', '))}</span>`;

  return `
    <div class="history-item">
      <span class="tip-help"${tipAttr(isCreated ? 'Issue created' : 'Skipped')}>${icon}</span>
      <span class="history-title">${link}</span>
      <span class="history-meta">${isCreated ? '' : esc(entry.reason || '')}</span>
    </div>
  `;
}

// ── Events ──────────────────────────────────────────────

function bindEvents() {
  // Tabs
  document.querySelectorAll('.UnderlineNav-item').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.UnderlineNav-item').forEach((t) => t.removeAttribute('aria-current'));
      tab.setAttribute('aria-current', 'page');
      state.activeTab = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach((c) => c.style.display = 'none');
      document.getElementById(`tab-${state.activeTab}`).style.display = '';
    });
  });

  // Scan buttons
  document.getElementById('btn-scan-empty')?.addEventListener('click', triggerScan);

  // Mark complete
  document.getElementById('btn-complete').addEventListener('click', () => {
    showQuestRewards(async () => {
      try {
        await api('/scan/complete', { method: 'POST' });
        await refreshAll();
      } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
      }
    });
  });

  // Settings
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-close-settings').addEventListener('click', () => {
    document.getElementById('settings-dialog').close();
  });
  document.getElementById('btn-cancel-settings').addEventListener('click', () => {
    document.getElementById('settings-dialog').close();
  });
  document.getElementById('settings-form').addEventListener('submit', saveSettings);
  document.getElementById('btn-add-category').addEventListener('click', addCategoryRow);
  document.getElementById('cfg-meta-issue-enabled').addEventListener('change', (e) => {
    document.getElementById('cfg-meta-issue-options').style.display = e.target.checked ? '' : 'none';
  });
  // Multi-repo editor: delegated add/remove, and keep the meta-name datalist fresh.
  document.getElementById('cfg-multirepo').addEventListener('click', onMultiRepoEditorClick);
  document.getElementById('cfg-multirepo').addEventListener('input', (e) => {
    if (e.target.dataset.mr === 'meta-name') refreshMetaNameDatalist();
  });

  // History filter
  document.getElementById('history-filter').addEventListener('change', renderHistory);

  for (const [id, field, storageKey] of [
    ['queue-filter', 'queueFilter', 'queue-filter'],
    ['queue-version-filter', 'queueVersionFilter', 'queue-version-filter'],
    ['queue-merge-filter', 'queueMergeFilter', 'queue-merge-filter'],
    ['queue-doc-work-filter', 'queueDocWorkFilter', 'queue-doc-work-filter'],
    ['queue-category-filter', 'queueCategoryFilter', 'queue-category-filter'],
    ['queue-priority-filter', 'queuePriorityFilter', 'queue-priority-filter'],
  ]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('change', () => {
      state[field] = el.value;
      sessionStorage.setItem(storageKey, el.value);
      if (field === 'queueMergeFilter') syncMergeCustomRow();
      renderQueue();
    });
  }

  const onCustomMergeDateChange = () => {
    const fromEl = document.getElementById('queue-merge-from');
    const toEl = document.getElementById('queue-merge-to');
    state.queueMergeFrom = fromEl?.value ?? '';
    state.queueMergeTo = toEl?.value ?? '';
    if (state.queueMergeFrom) sessionStorage.setItem('queue-merge-from', state.queueMergeFrom);
    else sessionStorage.removeItem('queue-merge-from');
    if (state.queueMergeTo) sessionStorage.setItem('queue-merge-to', state.queueMergeTo);
    else sessionStorage.removeItem('queue-merge-to');
    renderQueue();
  };
  document.getElementById('queue-merge-from')?.addEventListener('change', onCustomMergeDateChange);
  document.getElementById('queue-merge-to')?.addEventListener('change', onCustomMergeDateChange);
  document.getElementById('btn-merge-custom-clear')?.addEventListener('click', () => {
    state.queueMergeFrom = '';
    state.queueMergeTo = '';
    sessionStorage.removeItem('queue-merge-from');
    sessionStorage.removeItem('queue-merge-to');
    const fromEl = document.getElementById('queue-merge-from');
    const toEl = document.getElementById('queue-merge-to');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
    renderQueue();
  });

  document.getElementById('btn-queue-filters-reset')?.addEventListener('click', resetQueueFilters);
}

function bindCardEvents() {
  // Toggle expand/collapse
  document.querySelectorAll('[data-action="toggle"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.triage-select')) return;
      el.closest('.triage-card').classList.toggle('expanded');
    });
  });

  document.querySelectorAll('.triage-select').forEach((input) => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', () => {
      setItemSelected(input.dataset.item, input.checked);
    });
  });

  // Create issue
  document.querySelectorAll('[data-action="create"]').forEach((btn) => {
    btn.addEventListener('click', () => createIssue(btn.dataset.item));
  });

  // Skip (immediate, no modal)
  document.querySelectorAll('[data-action="dismiss"]').forEach((btn) => {
    btn.addEventListener('click', () => skipItem(btn.dataset.item, btn.dataset.reason));
  });

  // Field edits (debounced save)
  document.querySelectorAll('[data-field][data-item]').forEach((el) => {
    const event = el.tagName === 'SELECT' ? 'change' : 'input';
    let timeout;
    el.addEventListener(event, () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => saveFieldEdit(el.dataset.item, el.dataset.field, el.value), 500);
    });
  });

  // Editor tabs (write/preview)
  document.querySelectorAll('[data-editor]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const itemId = tab.dataset.item;
      const card = tab.closest('.triage-card-body');
      const textarea = card.querySelector(`textarea[data-item="${itemId}"]`);
      const preview = card.querySelector(`[data-preview="${itemId}"]`);
      const tabs = card.querySelectorAll('[data-editor]');

      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      if (tab.dataset.editor === 'preview') {
        textarea.style.display = 'none';
        preview.style.display = '';
        preview.innerHTML = renderMarkdown(textarea.value);
      } else {
        textarea.style.display = '';
        preview.style.display = 'none';
      }
    });
  });

  // Render initial preview for issue bodies (default to preview mode)
  document.querySelectorAll('[data-preview]').forEach((preview) => {
    const itemId = preview.dataset.preview;
    const textarea = preview.closest('.triage-card-body')?.querySelector(`textarea[data-item="${itemId}"]`);
    if (textarea && textarea.value) {
      preview.innerHTML = renderMarkdown(textarea.value);
    }
  });

  // Toggle issue title edit
  document.querySelectorAll('[data-action="toggle-title-edit"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const itemId = btn.dataset.item;
      const header = btn.closest('.issue-block-header');
      const display = header.querySelector(`[data-title-display="${itemId}"]`);
      const input = header.querySelector(`input[data-field="title"]`);
      const editing = input.style.display !== 'none';

      if (editing) {
        display.textContent = input.value;
        display.style.display = '';
        input.style.display = 'none';
      } else {
        display.style.display = 'none';
        input.style.display = '';
        input.focus();
      }
    });
  });

  // Screenshot lightbox
  document.querySelectorAll('.screenshot-thumb').forEach((img) => {
    img.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.className = 'lightbox-overlay';
      overlay.innerHTML = `<img src="${img.src}" />`;
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    });
  });
}

// ── Actions ─────────────────────────────────────────────

async function triggerScan() {
  const btn = document.getElementById('btn-run-scan');
  if (btn) btn.disabled = true;
  showLoading(true, 'Scanning GitHub for merged PRs. This can take a few minutes.');
  try {
    const result = await api('/scan', { method: 'POST' });
    const total = result.scanStats?.total ?? result.items?.length ?? 0;
    const added = result.scanStats?.added;
    showToast(
      added == null
        ? `Scan finished: ${total} items in the queue.`
        : `Scan finished: ${added} new, ${total} items in the queue.`,
      'success'
    );
    await refreshAll();
  } catch (err) {
    showToast(`Scan failed: ${err.message}`, 'error');
  } finally {
    showLoading(false);
    if (btn) btn.disabled = false;
  }
}

async function saveFieldEdit(itemId, field, value) {
  try {
    const payload = { userEdits: { [field]: value } };
    if (field === 'title') {
      payload.suggestedTitle = value;
    }
    const updated = await api(`/queue/${itemId}`, {
      method: 'PATCH',
      body: payload,
    });
    // Update local state
    const idx = state.queue.items.findIndex((i) => i.id === itemId);
    if (idx >= 0) state.queue.items[idx] = updated;
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  }
}

async function runBulkAction() {
  const action = document.getElementById('bulk-action-select')?.value ?? 'accept';
  const ids = [...state.selectedQueueIds];
  if (!ids.length) return;

  if (action === 'accept') {
    await createBulkIssues(ids);
    return;
  }

  const reason = BULK_ACTIONS[action]?.reason;
  if (reason) await bulkDismissIssues(ids, reason);
}

async function createBulkIssues(ids = [...state.selectedQueueIds]) {
  if (!ids.length) return;

  const titles = ids
    .map((id) => state.queue.items.find((i) => i.id === id))
    .filter(Boolean)
    .slice(0, 5)
    .map((i) => i.userEdits?.title ?? i.suggestedTitle);
  const preview =
    titles.length >= ids.length
      ? titles.map((t) => `• ${t}`).join('\n')
      : `${titles.map((t) => `• ${t}`).join('\n')}\n• …and ${ids.length - titles.length} more`;

  if (
    !confirm(
      `Create ${ids.length} GitHub issue${ids.length === 1 ? '' : 's'}? Each uses its card title, target repo, and template body.\n\n${preview}`
    )
  ) {
    return;
  }

  beginBulkProgress(ids.length, 'Creating issues');
  let ok = 0;
  let bad = 0;
  /** @type {string | null} */
  let firstErr = null;

  try {
    for (let i = 0; i < ids.length; i++) {
      const queueItemId = ids[i];
      try {
        await api('/create-issue', { method: 'POST', body: { queueItemId } });
        ok += 1;
      } catch (err) {
        bad += 1;
        if (!firstErr) firstErr = err.message;
      }
      setBulkProgress(i + 1, ids.length, 'Creating issues');
    }
    state.selectedQueueIds.clear();
    if (bad === 0) {
      showToast(`Created ${ok} issue${ok === 1 ? '' : 's'}.`, 'success');
    } else {
      showToast(
        `Created ${ok}, failed ${bad}. First error: ${firstErr ?? 'unknown error'}`,
        bad === ids.length ? 'error' : 'success'
      );
    }
    await refreshAll();
  } catch (err) {
    showToast(`Bulk create failed: ${err.message}`, 'error');
  } finally {
    endBulkProgress();
  }
}

async function bulkDismissIssues(ids, reason) {
  const titles = ids
    .map((id) => state.queue.items.find((i) => i.id === id))
    .filter(Boolean)
    .slice(0, 5)
    .map((i) => i.userEdits?.title ?? i.suggestedTitle);
  const preview =
    titles.length >= ids.length
      ? titles.map((t) => `• ${t}`).join('\n')
      : `${titles.map((t) => `• ${t}`).join('\n')}\n• …and ${ids.length - titles.length} more`;

  if (
    !confirm(
      `Skip ${ids.length} item${ids.length === 1 ? '' : 's'} as "${reason}"?\n\n${preview}`
    )
  ) {
    return;
  }

  beginBulkProgress(ids.length, 'Skipping');
  let ok = 0;
  let bad = 0;
  /** @type {string | null} */
  let firstErr = null;

  try {
    for (let i = 0; i < ids.length; i++) {
      const queueItemId = ids[i];
      try {
        await api('/dismiss', { method: 'POST', body: { queueItemId, reason } });
        ok += 1;
      } catch (err) {
        bad += 1;
        if (!firstErr) firstErr = err.message;
      }
      setBulkProgress(i + 1, ids.length, 'Skipping');
    }
    state.selectedQueueIds.clear();
    if (bad === 0) {
      showToast(`Skipped ${ok} item${ok === 1 ? '' : 's'} (${reason}).`, 'success');
    } else {
      showToast(
        `Skipped ${ok}, failed ${bad}. First error: ${firstErr ?? 'unknown error'}`,
        bad === ids.length ? 'error' : 'success'
      );
    }
    await refreshAll();
  } finally {
    endBulkProgress();
  }
}

async function createIssue(itemId) {
  const card = document.querySelector(`.triage-card[data-id="${itemId}"]`);
  const btn = card.querySelector('[data-action="create"]');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    const goodFirstIssue = card.querySelector('[data-field="goodFirstIssue"]')?.checked ?? false;
    const result = await api('/create-issue', {
      method: 'POST',
      body: { queueItemId: itemId, goodFirstIssue },
    });
    showToast(`Quest accepted! Issue #${result.issue.number} created.`, 'success');
    if (result.issue.skippedLabels?.length) {
      showToast(
        `Issue created without unavailable labels: ${result.issue.skippedLabels.join(', ')}`,
        'error'
      );
    }
    if (result.projectFields && result.projectFields.ok === false) {
      showToast(
        `Issue created, but project fields were not set. ${result.projectFields.message ?? ''}`.trim(),
        'error'
      );
    }
    await refreshAll();
  } catch (err) {
    showToast(`Failed to create issue: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Create issue';
  }
}

async function skipItem(itemId, reason = 'no docs needed') {
  try {
    await api('/dismiss', {
      method: 'POST',
      body: { queueItemId: itemId, reason },
    });
    showToast(`Quest skipped. ${reason}.`, 'success');
    await refreshAll();
  } catch (err) {
    showToast(`Skip failed: ${err.message}`, 'error');
  }
}

async function undoDismiss(prNumbers) {
  try {
    await api('/undo-dismiss', {
      method: 'POST',
      body: { prNumbers },
    });
    showToast('Quest restored to your log.', 'success');
    await refreshAll();
  } catch (err) {
    showToast(`Undo failed: ${err.message}`, 'error');
  }
}

// ── Settings ────────────────────────────────────────────

function openSettings() {
  const config = state.config;
  if (!config) return;

  document.getElementById('cfg-title').value = config.title ?? '';

  // Multi-repo configs (`repos[]`) are surfaced as editable JSON; the legacy
  // single-repo form can't represent multiple groups. Legacy configs keep the form.
  const isMultiRepo = Array.isArray(config.repos) && config.repos.length > 0;
  document.getElementById('cfg-legacy').style.display = isMultiRepo ? 'none' : '';
  document.getElementById('cfg-multirepo').style.display = isMultiRepo ? '' : 'none';

  if (isMultiRepo) {
    renderMultiRepoEditor(config);
    document.getElementById('cfg-raw-json').value = JSON.stringify(config, null, 2);
    const adv = document.getElementById('cfg-raw-advanced');
    if (adv) adv.open = false;
    document.getElementById('settings-dialog').showModal();
    return;
  }

  document.getElementById('cfg-source-repo').value = `${config.sourceRepo.owner}/${config.sourceRepo.repo}`;
  document.getElementById('cfg-target-repo').value = `${config.targetRepo.owner}/${config.targetRepo.repo}`;
  document.getElementById('cfg-version-pattern').value = config.versionLabelPattern ?? '^v\\d+\\.\\d+\\.\\d+$';
  document.getElementById('cfg-release-note-labels').value = (config.releaseNoteLabels ?? []).join(', ');
  document.getElementById('cfg-issue-labels').value = (config.issueLabels ?? []).join(', ');

  const metaEnabled = config.metaIssue?.enabled !== false;
  document.getElementById('cfg-meta-issue-enabled').checked = metaEnabled;
  document.getElementById('cfg-meta-issue-pattern').value = config.metaIssue?.titlePattern ?? '';
  document.getElementById('cfg-meta-issue-options').style.display = metaEnabled ? '' : 'none';

  const catContainer = document.getElementById('cfg-categories');
  catContainer.innerHTML = '';
  for (const cat of config.categories ?? []) {
    catContainer.appendChild(createCategoryRow(cat));
  }

  document.getElementById('settings-dialog').showModal();
}

function createCategoryRow(cat = {}) {
  const name = cat.name ?? '';
  const labels = (cat.labels ?? []).join(', ');
  // Surface overrides that this form doesn't edit yet, so they're visible
  // (and the save path preserves them). Edit these via config JSON for now.
  const overrides = [];
  if (cat.metaIssueHeading) overrides.push(`heading: ${cat.metaIssueHeading}`);
  if (cat.metaIssue === null) overrides.push('meta: none');
  else if (typeof cat.metaIssue === 'string') overrides.push(`meta: ${cat.metaIssue}`);
  if (cat.area) overrides.push(`area: ${cat.area}`);
  if (cat.featureLabel) overrides.push(`feature label: ${cat.featureLabel}`);
  if (cat.feature) overrides.push(`project feature: ${cat.feature}`);
  if (cat.target) overrides.push(`target: ${cat.target.owner}/${cat.target.repo}`);
  if (cat.project?.number) overrides.push(`project: #${cat.project.number}`);
  const overrideHint = overrides.length
    ? `<div class="category-override-hint">${esc(overrides.join('  ·  '))}</div>`
    : '';

  const row = document.createElement('div');
  row.className = 'category-row';
  row.innerHTML = `
    <input class="form-control input-sm" placeholder="Category name" value="${esc(name)}" data-cat="name" />
    <input class="form-control input-sm" placeholder="Labels (comma-separated)" value="${esc(labels)}" data-cat="labels" />
    <button type="button" class="btn-octicon" aria-label="Remove" data-action="remove-category">
      <svg class="octicon" viewBox="0 0 16 16" width="16" height="16">
        <path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
      </svg>
    </button>
    ${overrideHint}
  `;
  row.querySelector('[data-action="remove-category"]').addEventListener('click', () => row.remove());
  return row;
}

function addCategoryRow() {
  document.getElementById('cfg-categories').appendChild(createCategoryRow());
}

// ── Multi-repo structured settings editor ───────────────

function metaIssueNames() {
  return [...document.querySelectorAll('#cfg-mr-metaissues [data-mr="meta-name"]')]
    .map((i) => i.value.trim())
    .filter(Boolean);
}

function refreshMetaNameDatalist() {
  const dl = document.getElementById('cfg-mr-metanames');
  if (dl) dl.innerHTML = metaIssueNames().map((n) => `<option value="${esc(n)}"></option>`).join('');
}

function mrMetaRow(name = '', pattern = '') {
  const row = document.createElement('div');
  row.className = 'mr-meta-row';
  row.innerHTML = `
    <input class="form-control input-sm" data-mr="meta-name" placeholder="name (e.g. kibana)" value="${esc(name)}" />
    <input class="form-control input-sm" data-mr="meta-pattern" placeholder="Kibana {version}" value="${esc(pattern)}" />
    <button type="button" class="btn-octicon" data-action="remove-metaissue" aria-label="Remove">✕</button>
  `;
  return row;
}

function mrCatRow(cat = {}) {
  const row = document.createElement('div');
  row.className = 'mr-cat';
  row.dataset.catName = cat.name ?? '';
  row.innerHTML = `
    <input class="form-control input-sm" data-mr="cat-name" placeholder="Name" value="${esc(cat.name ?? '')}" />
    <input class="form-control input-sm" data-mr="cat-labels" placeholder="labels, comma-sep" value="${esc((cat.labels ?? []).join(', '))}" />
    <input class="form-control input-sm" data-mr="cat-area" placeholder="(default)" value="${esc(cat.area ?? '')}" />
    <input class="form-control input-sm" data-mr="cat-feature-label" placeholder="Feature: …" value="${esc(cat.featureLabel ?? '')}" />
    <input class="form-control input-sm" list="cfg-mr-metanames" data-mr="cat-meta" placeholder="(inherit)" value="${esc(typeof cat.metaIssue === 'string' ? cat.metaIssue : '')}" />
    <input class="form-control input-sm" data-mr="cat-issuelabels" placeholder="(inherit)" value="${esc((cat.issueLabels ?? []).join(', '))}" />
    <input class="form-control input-sm" data-mr="cat-projnum" placeholder="(inherit)" value="${esc(cat.projectNumber ?? '')}" />
    <button type="button" class="btn-octicon" data-action="remove-category" aria-label="Remove">✕</button>
  `;
  return row;
}

function mrRepoCard(repo = {}, cfg = {}) {
  const card = document.createElement('div');
  card.className = 'mr-repo';
  card.dataset.repoId = repo.id ?? '';
  const src = repo.source ? `${repo.source.owner}/${repo.source.repo}` : '';
  const tgt = repo.target ? `${repo.target.owner}/${repo.target.repo}` : '';
  const p = repo.project ?? {};
  // Pre-fill scan settings with the repo's value, falling back to the top-level
  // (so an existing global default surfaces per-repo and is migrated on save).
  const release = (repo.releaseNoteLabels ?? cfg.releaseNoteLabels ?? []).join(', ');
  const version = repo.versionLabelPattern ?? cfg.versionLabelPattern ?? '';
  const issueLabels = (repo.issueLabels ?? cfg.issueLabels ?? []).join(', ');
  card.innerHTML = `
    <div class="mr-repo-head">
      <input class="form-control input-sm" data-mr="repo-label" placeholder="Label (e.g. Kibana)" value="${esc(repo.label ?? '')}" />
      <button type="button" class="btn btn-sm" data-action="remove-repo">Remove</button>
    </div>
    <div class="mr-grid2">
      <label class="mr-field">Source repo<input class="form-control input-sm" data-mr="repo-source" placeholder="elastic/kibana" value="${esc(src)}" /></label>
      <label class="mr-field">Target repo<input class="form-control input-sm" data-mr="repo-target" placeholder="elastic/docs-content" value="${esc(tgt)}" /></label>
    </div>
    <div class="mr-grid2">
      <label class="mr-field">Default meta issue<input class="form-control input-sm" list="cfg-mr-metanames" data-mr="repo-meta" placeholder="(none)" value="${esc(repo.metaIssue ?? '')}" /></label>
      <label class="mr-field">Version label pattern (regex)<input class="form-control input-sm" data-mr="repo-version" placeholder="^v\\d+\\.\\d+\\.\\d+$" value="${esc(version)}" /></label>
    </div>
    <label class="mr-field">Release note labels (comma-separated)<input class="form-control input-sm" data-mr="repo-release" placeholder="release_note:*, release_note:feature, ..." value="${esc(release)}" /></label>
    <div class="mr-grid2 mt-2">
      <label class="mr-field">Default project number<input class="form-control input-sm" data-mr="repo-proj-number" placeholder="1034" value="${esc(p.number ?? '')}" /></label>
      <label class="mr-field">Board Area field<input class="form-control input-sm" data-mr="repo-proj-area" placeholder="Kibana core" value="${esc(p.defaultArea ?? '')}" /></label>
    </div>
    <label class="mr-field mt-2">Default issue labels (comma-separated)<input class="form-control input-sm" data-mr="repo-issuelabels" placeholder="Team:Docs" value="${esc(issueLabels)}" /></label>
    <div class="mr-cats-label">Categories</div>
    <div class="mr-cat mr-cat-head">
      <span>Name</span><span>Source labels</span><span>Project Area</span><span>Feature label</span><span>Meta issue</span><span>Issue labels</span><span>Project #</span><span></span>
    </div>
    <div class="mr-cats"></div>
    <button type="button" class="btn btn-sm mt-1" data-action="add-category">+ Add category</button>
  `;
  const catsEl = card.querySelector('.mr-cats');
  for (const c of repo.categories ?? []) catsEl.appendChild(mrCatRow(c));
  return card;
}

function renderMultiRepoEditor(config) {
  const metaWrap = document.getElementById('cfg-mr-metaissues');
  metaWrap.innerHTML = '';
  const entries = Object.entries(config.metaIssues ?? {});
  if (entries.length === 0) metaWrap.appendChild(mrMetaRow());
  else for (const [n, pat] of entries) metaWrap.appendChild(mrMetaRow(n, pat));

  const reposWrap = document.getElementById('cfg-mr-repos');
  reposWrap.innerHTML = '';
  for (const r of config.repos ?? []) reposWrap.appendChild(mrRepoCard(r, config));

  refreshMetaNameDatalist();
}

/** Build a config object from the structured editor, preserving advanced fields
 *  (sizeMap, contentTypeMap, label-specific overrides, per-category target, …) by merging
 *  onto the loaded config matched by repo id / category name. */
function serializeMultiRepoEditor() {
  const base = JSON.parse(JSON.stringify(state.config ?? {}));
  const parseRepo = (v) => {
    const [owner, repo] = (v || '').split('/');
    return { owner: (owner || '').trim(), repo: (repo || '').trim() };
  };
  const csv = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
  const val = (el, sel) => el.querySelector(sel).value.trim();

  const metaIssues = {};
  for (const row of document.querySelectorAll('#cfg-mr-metaissues .mr-meta-row')) {
    const name = row.querySelector('[data-mr="meta-name"]').value.trim();
    if (name) metaIssues[name] = row.querySelector('[data-mr="meta-pattern"]').value.trim();
  }

  const repos = [];
  for (const card of document.querySelectorAll('#cfg-mr-repos .mr-repo')) {
    const orig = (base.repos ?? []).find((r) => r.id === card.dataset.repoId) ?? {};
    const source = parseRepo(val(card, '[data-mr="repo-source"]'));
    const target = parseRepo(val(card, '[data-mr="repo-target"]'));
    if (!source.owner || !source.repo) throw new Error('each repo needs a source like "owner/repo"');
    if (!target.owner || !target.repo) throw new Error('each repo needs a target like "owner/repo"');

    const label = val(card, '[data-mr="repo-label"]');
    const metaName = val(card, '[data-mr="repo-meta"]');
    const version = val(card, '[data-mr="repo-version"]');
    const release = csv(val(card, '[data-mr="repo-release"]'));
    const issueLabels = csv(val(card, '[data-mr="repo-issuelabels"]'));
    const projNumber = val(card, '[data-mr="repo-proj-number"]');
    const projArea = val(card, '[data-mr="repo-proj-area"]');

    // Project: number from the field (or original); org defaults to the source
    // owner; field maps (sizeMap, contentTypeMap, …) are preserved from the original.
    const number = projNumber ? Number(projNumber) : orig.project?.number;
    let project;
    if (number != null && !Number.isNaN(number)) {
      project = { ...(orig.project ?? {}), org: orig.project?.org ?? source.owner, number };
      if (projArea) project.defaultArea = projArea; else delete project.defaultArea;
    }

    const cats = [];
    for (const cr of card.querySelectorAll('.mr-cat:not(.mr-cat-head)')) {
      const name = val(cr, '[data-mr="cat-name"]');
      if (!name) continue;
      const origCat = (orig.categories ?? []).find((c) => c.name === cr.dataset.catName) ?? {};
      const cat = { ...origCat, name, labels: csv(val(cr, '[data-mr="cat-labels"]')) };
      const area = val(cr, '[data-mr="cat-area"]');
      if (area) cat.area = area; else delete cat.area;
      const featureLabel = val(cr, '[data-mr="cat-feature-label"]');
      if (featureLabel) cat.featureLabel = featureLabel; else delete cat.featureLabel;
      const metaRef = val(cr, '[data-mr="cat-meta"]');
      if (metaRef) cat.metaIssue = metaRef;
      else if (origCat.metaIssue !== null) delete cat.metaIssue; // keep an explicit opt-out (null)
      const catIssueLabels = csv(val(cr, '[data-mr="cat-issuelabels"]'));
      if (catIssueLabels.length) cat.issueLabels = catIssueLabels; else delete cat.issueLabels;
      const projnum = val(cr, '[data-mr="cat-projnum"]');
      if (projnum) cat.projectNumber = Number(projnum); else delete cat.projectNumber;
      cats.push(cat);
    }

    const repo = { ...orig, id: orig.id || `${source.owner}/${source.repo}`, source, target, categories: cats };
    if (label) repo.label = label; else delete repo.label;
    if (metaName) repo.metaIssue = metaName; else delete repo.metaIssue;
    if (release.length) repo.releaseNoteLabels = release; else delete repo.releaseNoteLabels;
    if (version) repo.versionLabelPattern = version; else delete repo.versionLabelPattern;
    if (issueLabels.length) repo.issueLabels = issueLabels; else delete repo.issueLabels;
    if (project) repo.project = project; else delete repo.project;
    repos.push(repo);
  }
  if (repos.length === 0) throw new Error('add at least one repository');

  const out = { ...base };
  out.title = document.getElementById('cfg-title').value.trim() || base.title;
  out.metaIssues = metaIssues;
  out.repos = repos;
  // Scan settings are now per-repo, and the flat shape is superseded by repos[].
  delete out.releaseNoteLabels;
  delete out.versionLabelPattern;
  delete out.issueLabels;
  delete out.sourceRepo;
  delete out.targetRepo;
  delete out.categories;
  return out;
}

function onMultiRepoEditorClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn || !document.getElementById('cfg-multirepo').contains(btn)) return;
  switch (btn.dataset.action) {
    case 'add-metaissue':
      document.getElementById('cfg-mr-metaissues').appendChild(mrMetaRow());
      break;
    case 'remove-metaissue':
      btn.closest('.mr-meta-row').remove();
      refreshMetaNameDatalist();
      break;
    case 'add-repo':
      document.getElementById('cfg-mr-repos').appendChild(mrRepoCard({}, state.config ?? {}));
      break;
    case 'remove-repo':
      btn.closest('.mr-repo').remove();
      break;
    case 'add-category':
      btn.closest('.mr-repo').querySelector('.mr-cats').appendChild(mrCatRow());
      break;
    case 'remove-category':
      btn.closest('.mr-cat').remove();
      break;
  }
}

async function saveSettings(e) {
  e.preventDefault();

  // Multi-repo configs: serialize from the structured editor, unless the
  // advanced raw-JSON panel is open (then that wins).
  if (Array.isArray(state.config?.repos) && state.config.repos.length > 0) {
    const rawOpen = document.getElementById('cfg-raw-advanced')?.open;
    let parsed;
    try {
      parsed = rawOpen
        ? JSON.parse(document.getElementById('cfg-raw-json').value)
        : serializeMultiRepoEditor();
    } catch (err) {
      showToast(`${rawOpen ? 'Invalid JSON' : 'Config error'}: ${err.message}`, 'error');
      return;
    }
    try {
      await api('/config', { method: 'PUT', body: parsed });
      document.getElementById('settings-dialog').close();
      showToast('Settings saved.', 'success');
      await refreshAll();
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    }
    return;
  }

  const parseRepo = (val) => {
    const [owner, repo] = val.split('/');
    return { owner: owner?.trim(), repo: repo?.trim() };
  };

  // Merge edited rows back onto the existing categories so fields this form
  // doesn't expose (metaIssueHeading, metaIssue, …) survive the save.
  const existingCats = state.config?.categories ?? [];
  const categories = [];
  for (const row of document.querySelectorAll('.category-row')) {
    const name = row.querySelector('[data-cat="name"]').value.trim();
    const labels = row.querySelector('[data-cat="labels"]').value
      .split(',').map((l) => l.trim()).filter(Boolean);
    if (name && labels.length) {
      const existing = existingCats.find((c) => c.name === name);
      categories.push({ ...existing, name, labels });
    }
  }

  // Spread the existing config first so fields not in this form (project,
  // maxMergeAgeMonths, repos, …) are preserved rather than dropped on save.
  const config = {
    ...state.config,
    title: document.getElementById('cfg-title').value.trim() || 'PR Docs Triage',
    sourceRepo: parseRepo(document.getElementById('cfg-source-repo').value),
    targetRepo: parseRepo(document.getElementById('cfg-target-repo').value),
    versionLabelPattern: document.getElementById('cfg-version-pattern').value.trim() || '^v\\d+\\.\\d+\\.\\d+$',
    releaseNoteLabels: document.getElementById('cfg-release-note-labels').value
      .split(',').map((l) => l.trim()).filter(Boolean),
    issueLabels: document.getElementById('cfg-issue-labels').value
      .split(',').map((l) => l.trim()).filter(Boolean),
    categories,
    metaIssue: {
      enabled: document.getElementById('cfg-meta-issue-enabled').checked,
      titlePattern: document.getElementById('cfg-meta-issue-pattern').value.trim() || undefined,
    },
  };

  try {
    await api('/config', { method: 'PUT', body: config });
    document.getElementById('settings-dialog').close();
    showToast('Settings saved.', 'success');
    await refreshAll();
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  }
}

// ── Helpers ─────────────────────────────────────────────

function groupByCategory(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.category)) map.set(item.category, []);
    map.get(item.category).push(item);
  }
  return map;
}

function showQuestRewards(onAccept) {
  const rewards = [
    { item: 'Gold', amount: `${Math.floor(Math.random() * 50 + 10)}g ${Math.floor(Math.random() * 99)}s`, icon: '🪙' },
    { item: 'Experience', amount: `${Math.floor(Math.random() * 5000 + 1000)} XP`, icon: '⭐' },
  ];

  const bonusPool = [
    { item: 'Tome of Documentation Mastery', amount: '+5 Intellect', icon: '📖' },
    { item: 'Cloak of the Diligent Reviewer', amount: '+3 Stamina', icon: '🧥' },
    { item: 'Ring of Clarity', amount: '+2 Spirit', icon: '💍' },
    { item: 'Scroll of Triage Efficiency', amount: 'Use: Next scan takes 50% less time', icon: '📜' },
    { item: "Hearthstone Biscuit", amount: 'Restores 10% sanity', icon: '🍪' },
    { item: 'Quill of the Lorekeeper', amount: '+4 Documentation Power', icon: '🪶' },
    { item: 'Badge of the Quest Completer', amount: 'Reputation: Exalted', icon: '🎖️' },
    { item: 'Elixir of Sustained Focus', amount: '+30 Concentration for 1 hour', icon: '🧪' },
  ];

  rewards.push(bonusPool[Math.floor(Math.random() * bonusPool.length)]);

  const overlay = document.createElement('div');
  overlay.className = 'reward-overlay';
  overlay.innerHTML = `
    <div class="reward-box">
      <div class="reward-header">Quest complete!</div>
      <div class="reward-subheader">You receive:</div>
      <ul class="reward-list">
        ${rewards.map((r) => `
          <li class="reward-item">
            <span class="reward-icon">${r.icon}</span>
            <span class="reward-name">${r.item}</span>
            <span class="reward-amount">${r.amount}</span>
          </li>
        `).join('')}
      </ul>
      <button class="reward-dismiss">${onAccept ? 'Accept rewards' : 'Continue'}</button>
    </div>
  `;
  overlay.querySelector('.reward-dismiss').addEventListener('click', async () => {
    overlay.remove();
    if (onAccept) await onAccept();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function badgeClass(needsDocs) {
  return {
    yes: 'docs-badge-yes',
    check: 'docs-badge-check',
    no: 'docs-badge-no',
  }[needsDocs] ?? 'docs-badge-check';
}

function sel(value, option) {
  return (value ?? 'TBD') === option ? 'selected' : '';
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** ` data-tip="…"` attribute for the shared tooltip, or '' when there's no text. */
function tipAttr(text) {
  return text ? ` data-tip="${esc(text).replaceAll('"', '&quot;')}"` : '';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Compute the serverless deploy week from a merge date (merge + 7 days = Monday of deploy week). */
function serverlessWeek(mergedAt) {
  if (!mergedAt) return null;
  const d = new Date(mergedAt);
  d.setDate(d.getDate() + 7);
  // Roll back to Monday of that week
  const day = d.getDay();
  const diff = day === 0 ? -6 : -(day - 1);
  d.setDate(d.getDate() + diff);
  const mon = new Date(d);
  const fri = new Date(d);
  fri.setDate(fri.getDate() + 4);
  const fmt = (dt) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(mon)}–${fmt(fri)}`;
}

/** Extract all version labels from a queue item's PR labels. */
function allVersions(item) {
  const pattern = state.config?.versionLabelPattern ? new RegExp(state.config.versionLabelPattern) : /^v\d+\.\d+\.\d+$/;
  const set = new Set();
  for (const pr of item.prs) {
    for (const label of pr.labels) {
      if (pattern.test(label)) set.add(label);
    }
  }
  return [...set].sort();
}

/** Compute the effective serverless week for an item (uses the latest merge date). */
function effectiveServerless(item) {
  const edits = item.userEdits ?? {};
  const applies = edits.serverlessApplies ?? item.assessment?.serverlessApplies ?? 'yes';
  if (applies === 'no') return 'N/A';
  if (edits.serverlessEstimate || item.assessment?.serverlessEstimate) {
    return edits.serverlessEstimate || item.assessment.serverlessEstimate;
  }
  if (applies === 'unknown') return 'TBD — verify';
  const latestMerge = item.prs
    .map((pr) => pr.mergedAt)
    .filter(Boolean)
    .sort()
    .pop();
  return serverlessWeek(latestMerge) || '';
}

/** Build an availability string like "v9.4.0 · Mar 10–14 (serverless)" */
function availabilityBadge(item) {
  const versions = allVersions(item);
  const sl = effectiveServerless(item);
  const parts = [];
  if (versions.length) parts.push(versions.join(', '));
  if (sl === 'N/A') parts.push('serverless: N/A');
  else if (sl) parts.push(`${sl} (serverless)`);
  return parts.join(' · ');
}

/** Render Markdown to HTML using the marked library */
function renderMarkdown(md) {
  if (!md) return '';
  if (typeof marked !== 'undefined') {
    return marked.parse(md);
  }
  // Fallback: return escaped text with line breaks
  return '<p>' + esc(md).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
}

function showLoading(show, message = '') {
  document.getElementById('loading-overlay').style.display = show ? '' : 'none';
  const msg = document.getElementById('loading-message');
  if (msg) {
    msg.textContent = message;
    msg.hidden = !show || !message;
  }
}

// ── Tooltips ────────────────────────────────────────────

/** @type {HTMLElement | null} */
let tooltipEl = null;
/** @type {Element | null} */
let tooltipTarget = null;
/** @type {Element | null} */
let tooltipDescribed = null;
let tooltipTimer = 0;

function ensureTooltipEl() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'ui-tooltip';
    tooltipEl.className = 'ui-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.hidden = true;
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

/**
 * @param {Element} target element with data-tip
 * @param {Element} [described] element that gets aria-describedby (the focused control)
 */
function showTooltip(target, described = target) {
  const text = target.getAttribute('data-tip');
  if (!text) return;
  hideTooltip();
  const el = ensureTooltipEl();
  el.textContent = text;
  el.classList.remove('ui-tooltip--above');
  el.hidden = false;

  const margin = 8;
  const gap = 8;
  const rect = target.getBoundingClientRect();
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  let top = rect.bottom + gap;
  if (top + height > window.innerHeight - margin && rect.top - gap - height > margin) {
    top = rect.top - gap - height;
    el.classList.add('ui-tooltip--above');
  }
  const centerX = rect.left + rect.width / 2;
  const left = Math.max(margin, Math.min(centerX - width / 2, window.innerWidth - width - margin));
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
  el.style.setProperty('--tip-arrow-x', `${Math.round(Math.max(10, Math.min(centerX - left, width - 10)))}px`);

  tooltipTarget = target;
  tooltipDescribed = described;
  described.setAttribute('aria-describedby', 'ui-tooltip');
}

function hideTooltip() {
  clearTimeout(tooltipTimer);
  if (tooltipEl) tooltipEl.hidden = true;
  if (tooltipDescribed?.getAttribute('aria-describedby') === 'ui-tooltip') {
    tooltipDescribed.removeAttribute('aria-describedby');
  }
  tooltipTarget = null;
  tooltipDescribed = null;
}

function bindTooltips() {
  document.addEventListener('mouseover', (e) => {
    const target = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
    if (target === tooltipTarget) return;
    hideTooltip();
    if (target) tooltipTimer = setTimeout(() => showTooltip(target), 250);
  });
  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) hideTooltip();
  });
  document.addEventListener('focusin', (e) => {
    const focused = e.target instanceof Element ? e.target : null;
    const target = focused?.closest('[data-tip]');
    if (focused && target && focused.matches(':focus-visible')) showTooltip(target, focused);
  });
  document.addEventListener('focusout', hideTooltip);
  document.addEventListener('mousedown', hideTooltip);
  document.addEventListener('scroll', hideTooltip, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideTooltip();
  });
}

// ── Toasts ──────────────────────────────────────────────

let toastContainer;

function showToast(message, type = 'success') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
