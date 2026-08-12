#!/usr/bin/env node
/**
 * Render a neofetch-style profile card as two themed SVGs.
 *
 * Every number comes from the public contribution API. The fields that would
 * give something away are drawn as redaction bars instead of text, which is
 * the point of the design: the profile is private, so the card says so in the
 * only way a terminal can.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const USER = process.env.PROFILE_USER || 'MeFax'
const OUT_DIR = process.argv[2] || 'assets'

const QUERY = `
query($login: String!) {
  user(login: $login) {
    createdAt
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount } }
      }
    }
  }
}`

// ------------------------------------------------------------------ data

function fetchData() {
  const raw = execFileSync(
    'gh',
    ['api', 'graphql', '-f', `query=${QUERY}`, '-F', `login=${USER}`],
    { encoding: 'utf8', maxBuffer: 8 << 20 },
  )
  const user = JSON.parse(raw).data.user
  const cal = user.contributionsCollection.contributionCalendar
  const days = cal.weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount))

  const elapsed = Date.now() - Date.parse(user.createdAt)
  const totalDays = Math.floor(elapsed / 86400000)
  const years = Math.floor(totalDays / 365)
  const rest = totalDays % 365

  return {
    uptime: `${years} years, ${rest} days`,
    commits: `${cal.totalContributions} in the last year`,
    active: `${days.filter((d) => d > 0).length} days`,
    peak: `${Math.max(...days)} in a day`,
  }
}

// ---------------------------------------------------------------- layout

const PAD = 26
const BLOCK = 8
const BGAP = 1
const BPITCH = BLOCK + BGAP
const TEXT_X = PAD + 13 * BPITCH - BGAP + 34
const VALUE_X = TEXT_X + 86
const LINE = 22
const W = 520
const H = 292

// A head-and-shoulders silhouette, fully redacted. It sits where neofetch
// would put an OS logo.
const SILHOUETTE = [
  '....#####....',
  '...#######...',
  '..#########..',
  '..#########..',
  '..#########..',
  '...#######...',
  '.....###.....',
  '..#########..',
  '.###########.',
  '#############',
  '#############',
]

const THEMES = {
  light: { bg: '#ffffff', border: '#d1d9e0', head: '#216e39', label: '#59636e',
           value: '#1f2328', rule: '#d1d9e0', redact: '#1f2328', cursor: '#216e39' },
  dark:  { bg: '#0d1117', border: '#30363d', head: '#39d353', label: '#8b949e',
           value: '#e6edf3', rule: '#30363d', redact: '#e6edf3', cursor: '#39d353' },
}

const FONT = 'ui-monospace,SFMono-Regular,\'SF Mono\',Menlo,Consolas,' +
             '\'DejaVu Sans Mono\',monospace'

/** Draw a run of solid blocks, the way a terminal renders a censored line. */
function redaction(x, y, width, fill) {
  const seg = 9, gap = 2, h = 12
  const parts = []
  for (let cx = x; cx + seg <= x + width; cx += seg + gap) {
    parts.push(`<rect x="${cx}" y="${y - h + 1}" width="${seg}" height="${h}" fill="${fill}"/>`)
  }
  return parts.join('')
}

function render(theme, data) {
  const t = THEMES[theme]
  const rows = [
    ['uptime', 'text', data.uptime],
    ['commits', 'text', data.commits],
    ['active', 'text', data.active],
    ['peak', 'text', data.peak],
    ['stack', 'text', 'Rust · TypeScript'],
    ['repos', 'redact', 78],
    ['focus', 'redact', 188],
    ['contact', 'redact', 100],
  ]

  const s = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
      `viewBox="0 0 ${W} ${H}" role="img" aria-label="Profile card for ${USER}">`,
    `<title>${USER}</title>`,
    '<style>' +
      '.r{opacity:0;animation:in .5s ease-out forwards}' +
      '@keyframes in{from{opacity:0;transform:translateX(-5px)}to{opacity:1;transform:none}}' +
      '.cur{animation:blink 1.06s steps(1) infinite}' +
      '@keyframes blink{50%{opacity:0}}' +
      `text{font-family:${FONT};font-size:13px}` +
      '</style>',
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="8" ` +
      `fill="${t.bg}" stroke="${t.border}"/>`,
  ]

  // Redacted logo slot.
  const oy = Math.round((H - (SILHOUETTE.length * BPITCH - BGAP)) / 2)
  const blocks = []
  SILHOUETTE.forEach((line, r) => {
    ;[...line].forEach((ch, c) => {
      if (ch === '#') {
        blocks.push(`<rect x="${PAD + c * BPITCH}" y="${oy + r * BPITCH}" ` +
                    `width="${BLOCK}" height="${BLOCK}" fill="${t.redact}"/>`)
      }
    })
  })
  s.push(`<g class="r" style="animation-delay:0s">${blocks.join('')}</g>`)

  // Header and rule.
  s.push(`<g class="r" style="animation-delay:.06s">` +
         `<text x="${TEXT_X}" y="${PAD + 18}" fill="${t.head}" font-weight="600">` +
         `${USER.toLowerCase()}@github</text></g>`)
  s.push(`<g class="r" style="animation-delay:.12s">` +
         `<line x1="${TEXT_X}" y1="${PAD + 32}" x2="${W - PAD}" y2="${PAD + 32}" ` +
         `stroke="${t.rule}"/></g>`)

  // Rows.
  let y = PAD + 56
  rows.forEach(([label, kind, val], i) => {
    const delay = (0.18 + i * 0.07).toFixed(2)
    let body = `<text x="${TEXT_X}" y="${y}" fill="${t.label}">${label}</text>`
    body += kind === 'text'
      ? `<text x="${VALUE_X}" y="${y}" fill="${t.value}">${val}</text>`
      : redaction(VALUE_X, y, val, t.redact)
    s.push(`<g class="r" style="animation-delay:${delay}s">${body}</g>`)
    y += LINE
  })

  // Prompt with a cursor that never stops blinking.
  const last = (0.18 + rows.length * 0.07).toFixed(2)
  s.push(`<g class="r" style="animation-delay:${last}s">` +
         `<text x="${TEXT_X}" y="${y + 4}" fill="${t.head}">$</text>` +
         `<rect class="cur" x="${TEXT_X + 14}" y="${y - 6}" width="8" height="12" ` +
         `fill="${t.cursor}"/></g>`)

  s.push('</svg>')
  return s.join('')
}

const data = fetchData()
mkdirSync(OUT_DIR, { recursive: true })
for (const theme of Object.keys(THEMES)) {
  const name = theme === 'light' ? 'card.svg' : 'card-dark.svg'
  const path = join(OUT_DIR, name)
  writeFileSync(path, render(theme, data), 'utf8')
  console.log(`${name}  ${W}x${H}  ${statSync(path).size} bytes`)
}
console.log(JSON.stringify(data, null, 2))
