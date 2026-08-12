#!/usr/bin/env node
/**
 * Render a neofetch-style profile card as a single dark SVG.
 *
 * Every figure comes from the public contribution API at build time, so the
 * card cannot drift out of date the way a hand-written status does.
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

  const totalDays = Math.floor((Date.now() - Date.parse(user.createdAt)) / 86400000)

  return {
    uptime: `${Math.floor(totalDays / 365)} years, ${totalDays % 365} days`,
    commits: `${cal.totalContributions} in the last year`,
    active: `${days.filter((d) => d > 0).length} days`,
    peak: `${Math.max(...days)} in a day`,
  }
}

// ---------------------------------------------------------------- layout

const PAD = 26
const ART_LINE = 16
const ART_X = PAD
const TEXT_X = 200
const VALUE_X = TEXT_X + 86
const LINE = 22
const W = 480
const H = 208

// Ferris, the Rust mascot. Matches the crab in the profile status.
const ART = [
  '     _~^~^~_',
  ' \\) /  o o  \\ (/',
  "   '_   -   _'",
  "   / '-----' \\",
]

const C = {
  bg: '#0d1117',
  border: '#30363d',
  bright: '#ffffff',
  label: '#8b949e',
  value: '#e6edf3',
  rule: '#30363d',
}

const FONT = 'ui-monospace,SFMono-Regular,\'SF Mono\',Menlo,Consolas,' +
             '\'DejaVu Sans Mono\',monospace'

function render(data) {
  const rows = [
    ['uptime', data.uptime],
    ['commits', data.commits],
    ['active', data.active],
    ['peak', data.peak],
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
      `text{font-family:${FONT};font-size:13px;white-space:pre}` +
      '</style>',
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="8" ` +
      `fill="${C.bg}" stroke="${C.border}"/>`,
  ]

  // ASCII art, in the slot where neofetch puts the OS logo.
  const artTop = Math.round((H - ART.length * ART_LINE) / 2) + 12
  const art = ART.map((line, i) =>
    `<text xml:space="preserve" x="${ART_X}" y="${artTop + i * ART_LINE}" ` +
    `fill="${C.bright}">${line}</text>`).join('')
  s.push(`<g class="r" style="animation-delay:0s">${art}</g>`)

  // Header and rule.
  s.push(`<g class="r" style="animation-delay:.06s">` +
         `<text x="${TEXT_X}" y="${PAD + 18}" fill="${C.bright}" font-weight="600">` +
         `${USER.toLowerCase()}@github</text></g>`)
  s.push(`<g class="r" style="animation-delay:.12s">` +
         `<line x1="${TEXT_X}" y1="${PAD + 32}" x2="${W - PAD}" y2="${PAD + 32}" ` +
         `stroke="${C.rule}"/></g>`)

  // Rows.
  let y = PAD + 56
  rows.forEach(([label, val], i) => {
    const delay = (0.18 + i * 0.07).toFixed(2)
    s.push(`<g class="r" style="animation-delay:${delay}s">` +
           `<text x="${TEXT_X}" y="${y}" fill="${C.label}">${label}</text>` +
           `<text x="${VALUE_X}" y="${y}" fill="${C.value}">${val}</text></g>`)
    y += LINE
  })

  // Prompt with a cursor that never stops blinking.
  const last = (0.18 + rows.length * 0.07).toFixed(2)
  s.push(`<g class="r" style="animation-delay:${last}s">` +
         `<text x="${TEXT_X}" y="${y + 4}" fill="${C.bright}">$</text>` +
         `<rect class="cur" x="${TEXT_X + 14}" y="${y - 6}" width="8" height="12" ` +
         `fill="${C.bright}"/></g>`)

  s.push('</svg>')
  return s.join('')
}

const data = fetchData()
mkdirSync(OUT_DIR, { recursive: true })
const path = join(OUT_DIR, 'card.svg')
writeFileSync(path, render(data), 'utf8')
console.log(`card.svg  ${W}x${H}  ${statSync(path).size} bytes`)
console.log(JSON.stringify(data, null, 2))
