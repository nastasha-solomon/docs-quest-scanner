// @ts-check

/**
 * Review UI themes. Each theme pairs a CSS block in themes.css (keyed by
 * `<html data-theme="…">`) with the voice defined here. Fields a theme leaves
 * out fall back to the default theme in getTheme().
 *
 * Quest and rest lines are inserted as HTML, so literal angle brackets must be
 * written as &lt; and &gt;. Tooltips, toasts, and rewards are plain text.
 *
 * @typedef {{ svg?: string, glyph?: string, tooltips: string[] }} Mascot
 * @typedef {{ item: string, amount: string, icon: string }} Reward
 * @typedef {{ mark: string, greeting: string, name: string, count: number, quests: string, singular: boolean }} QuestLineContext
 * @typedef {{ mark: string, name: string }} RestLineContext
 * @typedef {{
 *   emptyHeading: string,
 *   emptyMessage: string,
 *   allResolvedHeading: string,
 *   allResolvedMessage: string,
 *   completeSub: string,
 *   completeFlavor: string,
 *   acceptLabel: string,
 *   toastAccepted: (issueNumber: number) => string,
 *   toastSkipped: (reason: string) => string,
 *   toastRestored: string,
 * }} ThemeText
 * @typedef {{ header: string, subheader: string, accept: string, dismiss: string, base: () => Reward[], bonus: Reward[] }} ThemeRewards
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   colorMode: 'light' | 'dark',
 *   fallbackName: string,
 *   noun: [string, string],
 *   marks: { active: string, done: string, turnIn: string },
 *   greetings: string[],
 *   questLines: (ctx: QuestLineContext) => string[],
 *   restLines: (ctx: RestLineContext) => string[],
 *   mascots: Mascot[],
 *   text: ThemeText,
 *   rewards: ThemeRewards,
 * }} Theme
 * @typedef {Partial<Omit<Theme, 'marks' | 'text' | 'rewards'>> & {
 *   id: string, name: string, description: string, colorMode: 'light' | 'dark',
 *   marks?: Partial<Theme['marks']>, text?: Partial<ThemeText>, rewards?: Partial<ThemeRewards>,
 * }} ThemeDef
 */

export const DEFAULT_THEME_ID = 'azeroth';
export const THEME_STORAGE_KEY = 'dqs-theme';
/** Read by the inline script in index.html so dark themes apply before first paint. */
export const THEME_MODE_STORAGE_KEY = 'dqs-theme-mode';

// ── Azeroth ─────────────────────────────────────────────

/** @type {Mascot[]} */
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

/** @type {Theme} */
const azeroth = {
  id: 'azeroth',
  name: 'Azeroth',
  description: 'Quest givers, inns, and hearthstones. The original look.',
  colorMode: 'light',
  fallbackName: 'Adventurer',
  noun: ['quest', 'quests'],
  marks: { active: '!', done: '?', turnIn: '?' },
  greetings: ['For the Light', "Lok'tar ogar"],
  questLines: ({ mark, greeting, name, count, quests, singular }) => [
    `${mark}${greeting}, ${name}! I have ${count} ${quests} that ${singular ? 'requires' : 'require'} your attention.`,
    `${mark}${greeting}, ${name}! ${count} ${quests} ${singular ? 'awaits' : 'await'} your judgment.`,
    `${mark}${greeting}, ${name}! The war effort needs you. ${count} ${quests} ${singular ? 'remains' : 'remain'}.`,
    `${mark}${greeting}, ${name}! ${count} ${quests} ${singular ? 'demands' : 'demand'} resolution.`,
    `${mark}${greeting}, ${name}! ${count} urgent ${quests} ${singular ? 'has' : 'have'} arrived.`,
  ],
  restLines: ({ mark, name }) => [
    `${mark}Rest well, ${name}. You have no quests. The realm is at peace.`,
    `${mark}All quests complete, ${name}. Return to the inn and rest.`,
    `${mark}Your quest log is empty, ${name}. A rare moment of peace in Azeroth.`,
    `${mark}No new orders, ${name}. Even heroes need to rest at the hearthstone.`,
  ],
  mascots: QUEST_ANIMALS,
  text: {
    emptyHeading: 'Your quest log is empty',
    emptyMessage: 'No PRs awaiting triage. Run a scan to discover new quests.',
    allResolvedHeading: 'All quests resolved!',
    allResolvedMessage: 'Every PR has been triaged. Mark the scan complete to log your progress.',
    completeSub: 'and collect rewards',
    completeFlavor: 'All quests resolved. Return to the inn.',
    acceptLabel: 'Accept quest and create issue',
    toastAccepted: (issueNumber) => `Quest accepted! Issue #${issueNumber} created.`,
    toastSkipped: (reason) => `Quest skipped. ${reason}.`,
    toastRestored: 'Quest restored to your log.',
  },
  rewards: {
    header: 'Quest complete!',
    subheader: 'You receive:',
    accept: 'Accept rewards',
    dismiss: 'Continue',
    base: () => [
      { item: 'Gold', amount: `${Math.floor(Math.random() * 50 + 10)}g ${Math.floor(Math.random() * 99)}s`, icon: '🪙' },
      { item: 'Experience', amount: `${Math.floor(Math.random() * 5000 + 1000)} XP`, icon: '⭐' },
    ],
    bonus: [
      { item: 'Tome of Documentation Mastery', amount: '+5 Intellect', icon: '📖' },
      { item: 'Cloak of the Diligent Reviewer', amount: '+3 Stamina', icon: '🧥' },
      { item: 'Ring of Clarity', amount: '+2 Spirit', icon: '💍' },
      { item: 'Scroll of Triage Efficiency', amount: 'Use: Next scan takes 50% less time', icon: '📜' },
      { item: 'Hearthstone Biscuit', amount: 'Restores 10% sanity', icon: '🍪' },
      { item: 'Quill of the Lorekeeper', amount: '+4 Documentation Power', icon: '🪶' },
      { item: 'Badge of the Quest Completer', amount: 'Reputation: Exalted', icon: '🎖️' },
      { item: 'Elixir of Sustained Focus', amount: '+30 Concentration for 1 hour', icon: '🧪' },
    ],
  },
};

// ── Midnight Coven ──────────────────────────────────────

/** @type {ThemeDef} */
const midnightCoven = {
  id: 'midnight-coven',
  name: 'Midnight Coven',
  description: 'Obsidian and twilight purple with starlight gold: tarot cards, moon phases, and a black cat familiar.',
  colorMode: 'dark',
  fallbackName: 'Witch',
  marks: { active: '🔮', done: '🌙', turnIn: '✨' },
  greetings: [
    'By shadow and starlight',
    'The grimoire stirs',
    'As the coven wills it',
    'Candle lit, circle cast',
    'The High Priestess turns a card',
    'The Moon card rises',
    'The Star shines on your queue',
    'Mercury is in retrograde, and so is this queue',
    'The Wheel of Fortune turns',
    'The Hermit raises his lantern',
    'Your rising sign is Documentation',
    'The planetary hour favors editing',
    'The crystal ball clears',
    'Your familiar has opinions',
    'The veil thins at midnight',
    'Salt the threshold',
    'By bell, book, and broken cross-link',
    'The bones have spoken',
    'The tarot turned up "needs docs"',
    'By herb and hyperlink',
    'As above in Kibana, so below in the docs',
    'The new moon calls for new pages',
    'Venus has entered the house of release notes',
    'The black cat crossed your backlog',
    'The owl calls three times',
  ],
  questLines: ({ mark, greeting, name, count, quests, singular }) => {
    /** @param {string} one @param {string} many */
    const v = (one, many) => (singular ? one : many);
    return [
      `${mark}${greeting}, ${name}! The cards reveal ${count} ${quests} that ${v('requires', 'require')} your judgment.`,
      `${mark}${greeting}, ${name}! ${count} ${quests} ${v('awaits', 'await')} resolution by moonlight.`,
      `${mark}${greeting}, ${name}! The crystal ball shows ${count} ${quests} not yet bound to issues.`,
      `${mark}${greeting}, ${name}! You drew the Tower: ${count} ${quests} ${v('needs', 'need')} rebuilding before release.`,
      `${mark}${greeting}, ${name}! The Star card promises clarity, but first, ${count} ${quests}.`,
      `${mark}${greeting}, ${name}! The Moon card warns of ${count} unclear release ${v('note', 'notes')}.`,
      `${mark}${greeting}, ${name}! The coven gathers 🧙‍♀️🧹🐈‍⬛🌙📜 over ${count} unfinished ${quests}.`,
      `${mark}${greeting}, ${name}! Your natal chart puts ${count} ${quests} in the house of documentation.`,
      `${mark}${greeting}, ${name}! The black cat brought you ${count} ${quests}. ${v('It looks', 'They look')} important.`,
      `${mark}${greeting}, ${name}! ${count} ${v('candle burns', 'candles burn')} for the ${quests} still in the queue.`,
      `${mark}${greeting}, ${name}! The pendulum swings toward ${count} ${quests}. Ink your quill.`,
      `${mark}${greeting}, ${name}! The scrying bowl ripples with ${count} ${quests}.`,
      `${mark}${greeting}, ${name}! Mercury retrograde scrambled ${count} release ${v('note', 'notes')}. Set ${v('it', 'them')} right.`,
      `${mark}${greeting}, ${name}! The grimoire gains ${count} new ${v('page', 'pages')} of unfinished work.`,
      `${mark}${greeting}, ${name}! The Wheel of Fortune landed on ${count} ${quests}. Fate has a sense of humor.`,
      `${mark}${greeting}, ${name}! ${count} ${v('sigil glows', 'sigils glow')} on the ward, waiting for your touch.`,
      `${mark}${greeting}, ${name}! The full moon rises over ${count} ${quests} that ${v('needs', 'need')} a witch's eye.`,
      `${mark}${greeting}, ${name}! The owl reports ${count} ${quests} circling the backlog.`,
    ];
  },
  restLines: ({ mark, name }) => [
    `${mark}The cards are face down, ${name}. No omens tonight.`,
    `${mark}The cauldron rests, ${name}. No quests on the ward.`,
    `${mark}All rites complete, ${name}. Close the grimoire and breathe.`,
    `${mark}🌙🕯️🔮🖤✨ The midnight ritual is complete, ${name}. Rest.`,
    `${mark}Only the night sky remains, ${name}. 🌌🦉🦇🕸️🌑`,
    `${mark}The moon is full and the queue is empty, ${name}.`,
    `${mark}The black cat is asleep on the keyboard, ${name}. Nothing left to file.`,
    `${mark}The crystal ball shows nothing, ${name}. A rare peace.`,
    `${mark}The candles gutter out, ${name}. Even witches need quiet hours.`,
    `${mark}Your ward holds, ${name}. Nothing breaches the empty log.`,
    `${mark}The stars wheel on without errand, ${name}. Enjoy the hush.`,
    `${mark}The Hermit card says rest and reflect, ${name}. The queue is clear.`,
  ],
  mascots: [
    { glyph: '🧙‍♀️', tooltips: ['The documentation witch: triage by candlelight', 'Keeper of the warded queue', 'Hex the backlog, bless the merge'] },
    { glyph: '🌙', tooltips: ['Moon-priestess of the triage circle', 'Waxing moon, waning backlog', 'Midnight is the best time for release notes'] },
    { glyph: '🕯️', tooltips: ['One candle, one focused draft', 'Light a candle for every broken link', 'Ritual lighting for quiet editing'] },
    { glyph: '🔮', tooltips: ['Scrying the PR runes since dawn', 'The crystal ball sees the doc gap before the user does', 'Divination says: add an example'] },
    { glyph: '🐈‍⬛', tooltips: ['Your familiar naps; you do not', 'The black cat approves this changelog', 'Familiar on the keyboard, typos in the draft'] },
    { glyph: '🖤', tooltips: ['Shadow, script, and changelog', 'Gothic hearts write clear prose', 'Dark aesthetic, bright explanations'] },
    { glyph: '🧹', tooltips: ['Sweeps stale drafts out of the queue', 'Broom parked by the merge train', 'Flies through the backlog after midnight'] },
    { glyph: '📜', tooltips: ['Salt, sage, and semantic versioning', 'An ancient scroll of release notes', 'The grimoire chooses the worthy page'] },
    { glyph: '🦉', tooltips: ['The owl reviews every sentence twice', 'Night watch over the docs repo', 'Wise eyes on vague release notes'] },
    { glyph: '🦇', tooltips: ['Echolocates broken cross-links', 'Hangs upside down to read the diff', 'Out after dark, chasing doc gaps'] },
    { glyph: '🕸️', tooltips: ['Weaves cross-references across the web', 'Caught a dangling link in the silk', 'Patient spider, tidy navigation'] },
    { glyph: '🌌', tooltips: ['Reads the release schedule in the stars', 'The stars say: ship the docs with the feature', 'Under the night sky, every page aligns'] },
  ],
  text: {
    emptyHeading: 'The grimoire is blank',
    emptyMessage: 'No PRs awaiting triage. Run a scan to call new quests out of the dark. 🌌🦉🦇🕸️🌑',
    allResolvedHeading: 'The circle is closed!',
    allResolvedMessage: 'Every PR has been triaged. Mark the scan complete to seal the ritual.',
    completeSub: 'and receive the blessing',
    completeFlavor: 'All quests resolved. The coven disperses until the next full moon. 🧙‍♀️🧹🐈‍⬛🌙📜',
    acceptLabel: 'Seal the pact and create issue',
    toastAccepted: (issueNumber) => `The pact is sealed. Issue #${issueNumber} created.`,
    toastSkipped: (reason) => `Banished. ${reason}.`,
    toastRestored: 'Summoned back from the void. The PR returns on the next scan.',
  },
  rewards: {
    header: 'The ritual is complete!',
    subheader: '🌙🕯️🔮🖤✨ The coven bestows:',
    accept: 'Accept the blessing',
    dismiss: 'Continue',
    base: () => [
      { item: 'Moonstones', amount: `${Math.floor(Math.random() * 12 + 3)}`, icon: '🌕' },
      { item: 'Starlight', amount: `${Math.floor(Math.random() * 900 + 100)} motes`, icon: '✨' },
    ],
    bonus: [
      { item: 'Tarot deck of Clear Prose', amount: '+5 Intuition', icon: '🃏' },
      { item: 'Black candle of Focus', amount: 'Burns through one long triage session', icon: '🕯️' },
      { item: 'Crystal ball', amount: 'Use: Foresee one broken link', icon: '🔮' },
      { item: "Familiar's favor", amount: '+3 Companionship', icon: '🐈‍⬛' },
      { item: 'Page from the grimoire', amount: '+4 Lore', icon: '📜' },
      { item: 'Enchanted broom', amount: 'Sweeps away one stale draft', icon: '🧹' },
      { item: 'Owl feather quill', amount: '+2 Wisdom', icon: '🪶' },
      { item: 'Obsidian mirror', amount: 'Reflects one vague sentence back at its author', icon: '🪞' },
    ],
  },
};

// ── Bright Falls (Alan Wake) ────────────────────────────

/** @type {ThemeDef} */
const brightFalls = {
  id: 'bright-falls',
  name: 'Bright Falls',
  description: 'A dusky Alan Wake theme: flashlights, typewriters, and coffee at the Oh Deer Diner.',
  colorMode: 'dark',
  fallbackName: 'Writer',
  noun: ['page', 'pages'],
  marks: { active: '🔦', done: '☕︎', turnIn: '✍️' },
  greetings: [
    'Welcome back to In Between',
    'Stay in the light',
    'Flashlight on, cursor blinking',
    "It's not a loop, it's a spiral",
    'The coffee is hot at the Oh Deer Diner',
    'Night Springs is on the air',
    'Saga has opened the Mind Place',
    'The typewriter keys are moving on their own',
    'The Clicker clicked',
    'Thomas Zane left notes in the margins',
    'Barry booked you a press tour',
    'Barry strung up the Christmas lights',
    'Your agent is on line one',
    'Words have power in Bright Falls',
    'Rose saved you a booth',
    'The Alan Wake Fan Club is now in session',
    'The Lady of the Light is watching over you',
    'Casey is on the case',
    'The Old Gods of Asgard are tuning up',
    'Cauldron Lake is still tonight',
    'Pat Maine is on the late-night radio',
    'Deerfest is in full swing',
    'Greetings from Watery, Washington',
    'Welcome to Coffee World',
    'Ilmo Koskela has a new business plan',
    'The Koskela brothers are filming another commercial',
    'Ahti is on vacation in Watery',
    'Ahti has the keys',
    'Karaoke night at Suomi Hall',
  ],
  questLines: ({ mark, greeting, name, count, singular }) => {
    /** @param {string} one @param {string} many */
    const v = (one, many) => (singular ? one : many);
    return [
      `${mark}${greeting}, ${name}! ${count} manuscript ${v('page needs', 'pages need')} rewriting before the story takes hold.`,
      `${mark}${greeting}, ${name}! Tonight's ${v('guest', 'guests')}: ${count} ${v('PR', 'PRs')} that never got a release note.`,
      `${mark}${greeting}, ${name}! Saga pinned ${count} ${v('clue', 'clues')} to the Mind Place wall. Time to profile the doc gaps.`,
      `${mark}${greeting}, ${name}! ${count} ${v('draft is', 'drafts are')} stuck in the Dark Place. Write ${v('it', 'them')} back into the light.`,
      `${mark}${greeting}, ${name}! ${count} ${v('page', 'pages')} of the manuscript came true. Now document what changed.`,
      `${mark}${greeting}, ${name}! Barry already told the press about ${count} ${v('feature', 'features')}. Better write the docs.`,
      `${mark}${greeting}, ${name}! The case file lists ${count} open ${v('lead', 'leads')}. Follow the merged PRs.`,
      `${mark}${greeting}, ${name}! The Old Gods of Asgard wrote a ballad about ${count} missing release ${v('note', 'notes')}. Don't make them write a second verse.`,
      `${mark}${greeting}, ${name}! Thomas Zane left ${count} ${v('note', 'notes')} in the margins. Turn ${v('it', 'them')} into docs.`,
      `${mark}${greeting}, ${name}! Rose refilled your coffee. ${count} ${v('PR is', 'PRs are')} waiting in the booth.`,
      `${mark}${greeting}, ${name}! The typewriter is warm: ${count} ${v('scene', 'scenes')} still ${v('needs', 'need')} writing.`,
      `${mark}${greeting}, ${name}! On Night Springs tonight: ${count} ${v('feature', 'features')} with no docs, and a narrator who can't explain ${v('it', 'them')}.`,
      `${mark}${greeting}, ${name}! ${count} Taken ${v('typo is', 'typos are')} lurking in the drafts. Burn ${v('it', 'them')} away with the flashlight.`,
      `${mark}${greeting}, ${name}! Casey's notebook lists ${count} undocumented ${v('change', 'changes')}. He wants answers.`,
      `${mark}${greeting}, ${name}! Pat Maine read ${count} listener ${v('question', 'questions')} on air. Each one is a doc request.`,
      `${mark}${greeting}, ${name}! The lamp flickers over ${count} unfinished ${v('chapter', 'chapters')}.`,
      `${mark}${greeting}, ${name}! Barry wrapped himself in Christmas lights to guard ${count} ${v('draft', 'drafts')} from the Darkness. Now finish ${v('it', 'them')}.`,
      `${mark}${greeting}, ${name}! Barry called from Hollywood. ${count} ${v('PR needs', 'PRs need')} docs before he can pitch the sequel.`,
      `${mark}${greeting}, ${name}! Your agent read ${count} ${v('release note', 'release notes')} and called ${v('it', 'them')} "unpublishable." He's not wrong.`,
      `${mark}${greeting}, ${name}! Fan Club president Rose Marigold has ${count} ${v('question', 'questions')} about the docs. She has read every page.`,
      `${mark}${greeting}, ${name}! The Lady of the Light sent the Angel Lamp. ${count} ${v('page', 'pages')} still ${v('needs', 'need')} its glow.`,
      `${mark}${greeting}, ${name}! Rose loaded her shotgun. ${count} ${v('Hater is', 'Haters are')} after the drafts, and Scratch is leaving bad reviews.`,
      `${mark}${greeting}, ${name}! Ilmo Koskela wants ${count} ${v('feature', 'features')} in the next Coffee World brochure. Jaakko just wants ${v('it', 'them')} documented.`,
      `${mark}${greeting}, ${name}! The Koskela brothers made a commercial about ${count} undocumented ${v('feature', 'features')}. Somebody has to write the fine print.`,
      `${mark}${greeting}, ${name}! Ilmo revved his motorcycle past ${count} stalled ${v('PR', 'PRs')}. Jaakko stayed behind to help.`,
      `${mark}${greeting}, ${name}! Ahti handed you ${count} ${v('key', 'keys')}, called you Tom, and walked off. Each one opens a doc gap.`,
      `${mark}${greeting}, ${name}! Ahti is "on vacation," but he left ${count} cryptic ${v('clue', 'clues')} about the merged PRs.`,
      `${mark}${greeting}, ${name}! Ahti and his Swedish brothers took the stage at Suomi Hall. ${count} ${v('PR', 'PRs')} can't wait for the encore.`,
    ];
  },
  restLines: ({ mark, name }) => [
    `${mark}The Oh Deer Diner is open late, ${name}. No quests tonight; the Dark Place can wait.`,
    `${mark}The lamp is lit and the queue is clear, ${name}. Stay in the light.`,
    `${mark}Mr. Door has no guests tonight, ${name}. The studio lights dim.`,
    `${mark}The manuscript is finished, ${name}. Every page made it into the light.`,
    `${mark}Saga closed the case file, ${name}. No open leads.`,
    `${mark}The typewriter rests, ${name}. Even the Writer takes a break.`,
    `${mark}Cauldron Lake is calm, ${name}. Nothing surfaced in the queue.`,
    `${mark}The Old Gods of Asgard are playing your song, ${name}. Take the night off.`,
    `${mark}Pat Maine is signing off, ${name}. Nothing left on the call-in line.`,
    `${mark}Rose flipped the diner sign to Closed, ${name}. The queue is empty.`,
    `${mark}Rose finished her shift at the Valhalla Nursing Home, ${name}. The Lady of the Light keeps watch tonight.`,
    `${mark}Barry unplugged the Christmas lights, ${name}. The Darkness has nothing left to read.`,
    `${mark}The Koskela brothers closed Coffee World for the night, ${name}. Ilmo is already planning tomorrow.`,
    `${mark}Ahti mopped the Dark Place, ${name}. Not a single draft left on the floor.`,
  ],
  mascots: [
    { glyph: '🔦', tooltips: ['Light burns away the Darkness, and vague release notes', 'Keep the beam on the doc gaps', 'Fresh batteries, fresh drafts'] },
    { glyph: '⌨️', tooltips: ['What the Writer types becomes true. Type carefully.', 'Clack, clack: another release note escapes the Dark Place', 'The keys remember every rewrite'] },
    { glyph: '✍️', tooltips: ['Words have power in Bright Falls', 'Edits in the margins, Thomas Zane style', 'Write it so readers can follow it in the dark'] },
    { glyph: '📺', tooltips: ['Tonight on In Between: the undocumented feature', 'Mr. Door would like a word. Preferably a clear one.', 'Night Springs: every feature has a twist ending'] },
    { glyph: '🌀', tooltips: ["It's not a loop, it's a spiral. So is the release train.", 'Each pass through the draft gets a little clearer', "The Dark Place repeats itself. Good docs don't."] },
    { glyph: '🌲', tooltips: ['Bright Falls, Washington: small town, big backlog', 'Deep in the pines, a PR waits for docs', 'Evergreen content, like the forest'] },
    { glyph: '☕', tooltips: ['Oh Deer Diner coffee: fuel for triage', 'A thermos of coffee keeps the Darkness at bay', 'Refills are free. Release notes are not.'] },
    { glyph: '💡', tooltips: ['Barry Wheeler: Christmas lights and a headlamp, for protection', 'Your agent says this release note needs more punch', 'Barry manages the Old Gods of Asgard. And, apparently, your backlog.'] },
    { glyph: '🌹', tooltips: ['Rose Marigold, president of the Alan Wake Fan Club', 'The Lady of the Light keeps the lamp burning', 'Rose has a shotgun for the Haters and fresh coffee for you'] },
    { glyph: '🎢', tooltips: ["Coffee World: the Koskela brothers' plan to save Watery", 'Ilmo has the vision. Jaakko goes along with it.', 'Brought to you by Ahma Beer and the Koskela brothers'] },
    { glyph: '🪣', tooltips: ['Ahti knows where every key is, and every doc gap', '"Tom," he says. Just go with it.', 'Mind the wet floor. Ahti just mopped the Dark Place.'] },
  ],
  text: {
    emptyHeading: 'The manuscript is blank',
    emptyMessage: 'No PRs awaiting triage. Run a scan to find new pages.',
    allResolvedHeading: 'Every page is in the light!',
    allResolvedMessage: 'Every PR has been triaged. Mark the scan complete to finish the chapter.',
    completeSub: 'and finish the chapter',
    completeFlavor: 'All quests resolved. The coffee at the Oh Deer Diner is still warm.',
    acceptLabel: 'Write it in and create issue',
    toastAccepted: (issueNumber) => `Written into the story. Issue #${issueNumber} created.`,
    toastSkipped: (reason) => `Left in the Dark Place. ${reason}.`,
    toastRestored: 'Pulled back from the Dark Place. The PR returns on the next scan.',
  },
  rewards: {
    header: 'Chapter complete!',
    subheader: 'You find:',
    accept: 'Pocket them',
    dismiss: 'Continue',
    base: () => [
      { item: 'Batteries', amount: `${Math.floor(Math.random() * 8 + 2)} AA`, icon: '🔋' },
      { item: 'Manuscript pages', amount: `${Math.floor(Math.random() * 20 + 5)} recovered`, icon: '📄' },
    ],
    bonus: [
      { item: 'Thermos of Oh Deer Diner coffee', amount: 'Restores 25% focus', icon: '☕' },
      { item: 'The Clicker', amount: 'Use: Change the scene', icon: '🔘' },
      { item: 'Typewriter ribbon', amount: '+5 Writing Power', icon: '⌨️' },
      { item: 'Flare gun', amount: 'Clears every Taken typo nearby', icon: '🎆' },
      { item: 'Old Gods of Asgard vinyl', amount: '+3 Morale', icon: '💿' },
      { item: 'Night Springs VHS tape', amount: 'Watch: Learn one new style rule', icon: '📼' },
      { item: 'Coffee World souvenir mug', amount: '+2 Caffeine', icon: '🍵' },
      { item: 'Deerfest pin', amount: 'Reputation: Local legend', icon: '🦌' },
      { item: 'Angel Lamp', amount: 'Returns the light to one scene', icon: '🪔' },
      { item: "Barry's Christmas lights", amount: '+4 Protection (allegedly)', icon: '🎄' },
      { item: 'Alan Wake Fan Club card', amount: 'Signed by Rose Marigold', icon: '🪪' },
      { item: "Ahti's keys", amount: 'Opens one locked door in the Dark Place', icon: '🗝️' },
      { item: 'Ahma Beer', amount: 'Courtesy of the Koskela brothers', icon: '🍺' },
    ],
  },
};

// ── Oldest House (Control) ──────────────────────────────

/**
 * A Board subtitle. The Board offers slash-separated alternatives because no
 * single human word fits what it means.
 * @param {string} text
 */
const board = (text) => `&lt; ${text} &gt;`;

/** @type {ThemeDef} */
const oldestHouse = {
  id: 'oldest-house',
  name: 'Oldest House',
  description: 'A Control theme: brutalist concrete, Bureau red, and memos from the Board.',
  colorMode: 'light',
  fallbackName: 'Director',
  marks: { active: '🟥', done: '🔻', turnIn: '🔺' },
  greetings: [
    'This is the Federal Bureau of Control',
    'Ah, ystävä',
    'Welcome to the Oldest House',
    'The Hotline is ringing',
    'Polaris is humming',
    'The hallways moved again',
    'Control Point secured',
    'Dr. Darling has a new slideshow',
    'Emily Pope found the files',
    'The Threshold Kids are on',
    'The Ashtray Maze is open',
    'Ahti is mopping the Central Executive',
    'The Hiss is quiet for now',
    'Someone is watching the Refrigerator',
    'Synchronicity detected',
  ],
  questLines: ({ mark, greeting, name, count, singular }) => {
    /** @param {string} one @param {string} many */
    const v = (one, many) => (singular ? one : many);
    return [
      `${mark}${board(`Welcome/Return, ${name}. Our favorite/current Director`)} ${board(`${count} ${v('deliverable awaits', 'deliverables await')} Documentation/Containment`)}`,
      `${mark}${board(`You should/must/will document ${count} ${v('Object', 'Objects')} of Change/Power`)} ${board(`This is a performance/survival metric, ${name}`)}`,
      `${mark}${board(`${count} ${v('change was', 'changes were')} Merged/Released/Unleashed without a Narrative`)} ${board(`Remediate/Rectify, ${name}`)}`,
      `${mark}${board(`You are mismanaging the Backlog/Self/Narrative, ${name}`)} ${board(`${count} ${v('item remains', 'items remain')} Unfiled/Unknowable`)}`,
      `${mark}${board(`${name}. Your quarterly/eternal review approaches`)} ${board(`${count} ${v('gap', 'gaps')} detected in the Documentation/Fabric`)}`,
      `${mark}${board(`We/You delegate ${count} ${v('action item', 'action items')} to the Asset/Director ${name}`)}`,
      `${mark}${board(`Alignment/Compliance is expected, ${name}`)} ${board(`${count} release ${v('note is', 'notes are')} Overdue/Unaccounted for`)}`,
      `${mark}${greeting}, ${name}! The Bureau logged ${count} Altered ${v('PR', 'PRs')}. Clear prose is containment.`,
      `${mark}${greeting}, ${name}! Ahti found ${count} ${v('PR', 'PRs')} behind the mop bucket. ${v('It needs', 'They need')} words, not wax.`,
      `${mark}${greeting}, ${name}! The Hotline rang ${count} ${v('time', 'times')}. Every call is a doc request.`,
      `${mark}${greeting}, ${name}! Dr. Darling calls ${count} undocumented ${v('feature', 'features')} "fascinating." Users call ${v('it', 'them')} confusing.`,
      `${mark}${greeting}, ${name}! The Hiss is chanting ${count} PR ${v('title', 'titles')}. Only a clear explanation breaks the loop.`,
      `${mark}${greeting}, ${name}! The Oldest House shifted: ${count} new ${v('room', 'rooms')} and no map. Draw ${v('it', 'them')}.`,
      `${mark}${greeting}, ${name}! ${count} ${v('Object', 'Objects')} of Power ${v('needs', 'need')} usage instructions.`,
      `${mark}${greeting}, ${name}! Jesse cleansed the Control Point. ${count} ${v('PR needs', 'PRs need')} a docs pass before the Hiss spreads.`,
      `${mark}${greeting}, ${name}! Emily Pope flagged ${count} ${v('memo', 'memos')} for redaction review.`,
    ];
  },
  restLines: ({ mark, name }) => [
    `${mark}${board('The queue is Contained/Resolved/Adequate')} ${board(`Rest/Recharge, ${name}. For now`)}`,
    `${mark}${board(`Your performance is Acceptable/Tolerable/Noted, ${name}`)}`,
    `${mark}${board('No deliverables remain')} ${board(`Enjoy your benefits/health plan, ${name}`)}`,
    `${mark}Ahti finished mopping, ${name}. Every hallway of the queue is clean.`,
    `${mark}The Hotline is silent, ${name}. Brew another pot of coffee.`,
    `${mark}No Altered PRs detected, ${name}. The Oldest House is quiet.`,
    `${mark}The Hiss is silent, ${name}. Not a single PR title is chanting.`,
    `${mark}Control Point cleansed, ${name}. Nothing left to file.`,
    `${mark}Polaris hums softly, ${name}. The queue is clear.`,
    `${mark}The Threshold Kids say good job, ${name}! No PRs today.`,
  ],
  mascots: [
    { glyph: '🟥', tooltips: ['The red square: Bureau-approved geometry', 'Brutalist, geometric, and on brand. Like a good style guide.', 'Square edges, clear headings'] },
    { glyph: '🔻', tooltips: ['< We/You see the Pyramid/Backlog >', '< The Board is Watching/Reviewing/Pleased >', '< Clearance/Permission granted. Proceed/Comply >'] },
    { glyph: '🔺', tooltips: ['The Bureau files every Altered PR', 'Federal Bureau of Control: geometry is a form of control', 'A Control Point: a safe place to save your draft'] },
    { glyph: '🕹️', tooltips: ['You are in Control. Mostly.', 'Good docs are the tutorial level', 'Press A to accept the quest'] },
    { glyph: '🌀', tooltips: ['The Oceanview Motel has more rooms than doors', 'Somewhere between the Oldest House and the Dark Place', "The Hiss repeats itself. Good docs don't."] },
    { glyph: '🗝️', tooltips: ['Ahti found the key. He always does.', 'An Oceanview Motel key. Room number: unclear.', 'Ah, ystävä. This one opens the changelog.'] },
    { glyph: '🚪', tooltips: ['Threshold doors lead anywhere. So do broken links.', 'One wrong door and you are in the Astral Plane', 'Knock first. The Oceanview Motel is always occupied.'] },
    { glyph: '📞', tooltips: ['The Hotline rings for the Director. And the docs team.', 'Every call is a doc request', 'Pick up. It might be a past Director with feedback.'] },
    { glyph: '📺', tooltips: ['Polaris flickers across the projector', 'The Threshold Kids are on. Take notes.', 'Broadcast anomaly detected in the release notes'] },
  ],
  text: {
    emptyHeading: 'The case file is empty',
    emptyMessage: 'No PRs awaiting triage. Run a scan to detect new Altered PRs.',
    allResolvedHeading: 'Every Altered PR is contained!',
    allResolvedMessage: 'Every PR has been triaged. Mark the scan complete to file your report.',
    completeSub: 'and file your report',
    completeFlavor: 'All quests resolved. The Board is satisfied. For now.',
    acceptLabel: 'File/Create/Contain issue',
    toastAccepted: (issueNumber) => `Filed with the Bureau. Issue #${issueNumber} created.`,
    toastSkipped: (reason) => `Redacted. ${reason}.`,
    toastRestored: 'Declassified. The PR returns on the next scan.',
  },
  rewards: {
    header: 'Report filed!',
    subheader: 'The Board grants you:',
    accept: 'Accept benefits',
    dismiss: 'Continue',
    base: () => [
      { item: 'Clearance', amount: `Level ${Math.floor(Math.random() * 6 + 2)}`, icon: '🪪' },
      { item: 'Overtime', amount: `${Math.floor(Math.random() * 30 + 5)} hours logged`, icon: '🕰️' },
    ],
    bonus: [
      { item: 'Federal Bureau of Control badge', amount: 'Clearance: Level 7', icon: '🔺' },
      { item: 'Service Weapon: Pierce form', amount: '+5 Precision', icon: '🎯' },
      { item: 'Hotline receiver', amount: 'Use: Hear one more doc request', icon: '📞' },
      { item: 'Oceanview Motel key', amount: 'Opens one threshold door', icon: '🗝️' },
      { item: 'Threshold door', amount: 'Leads somewhere. Probably the backlog.', icon: '🚪' },
      { item: 'Bureau-issued controller', amount: '+5 Control', icon: '🕹️' },
      { item: 'Red square sticker', amount: 'Approved for fan art', icon: '🟥' },
      { item: 'Threshold Kids broadcast', amount: 'Watch: Learn one Bureau procedure', icon: '📺' },
      { item: 'Refrigerator watch shift', amount: "Don't look away", icon: '👁️' },
      { item: 'Ashtray Maze backstage pass', amount: '+3 Morale', icon: '🎸' },
      { item: 'Comprehensive health plan', amount: 'Courtesy of the Board', icon: '🩺' },
    ],
  },
};

// ── Registry ────────────────────────────────────────────

/** @type {ThemeDef[]} */
export const THEMES = [azeroth, midnightCoven, brightFalls, oldestHouse];

/**
 * @param {string | null | undefined} id
 * @returns {Theme}
 */
export function getTheme(id) {
  const theme = THEMES.find((t) => t.id === id);
  if (!theme || theme === azeroth) return azeroth;
  return {
    ...azeroth,
    ...theme,
    marks: { ...azeroth.marks, ...theme.marks },
    text: { ...azeroth.text, ...theme.text },
    rewards: { ...azeroth.rewards, ...theme.rewards },
  };
}
