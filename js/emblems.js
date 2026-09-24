// One emblem per theorist, each the central image of its theory. They are
// inlined (not <use>-referenced) so CSS can animate their parts while a
// theorist is speaking.

const PARTS = {
  // A body holding itself in balance: a breathing core with a heartbeat, inside a set-point ring.
  body: `
    <circle class="e-ring" cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="1.5 3.5"/>
    <g class="e-breath">
      <circle cx="24" cy="24" r="13" fill="currentColor"/>
      <path d="M13.5 24.5h4l2.2-4.6 3.2 9.6 2.8-8 1.8 3h7" fill="none" stroke="var(--card)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`,
  // Physical wiring where every part affects every other: an integrated lattice.
  substrate: `
    <path d="M9 9H39M9 24H39M9 39H39M9 9V39M24 9V39M39 9V39M9 9L39 39M39 9L9 39M24 9L9 24M24 9L39 24M9 24L24 39M39 24L24 39" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".5"/>
    <g class="e-nodes" fill="currentColor">
      <circle cx="9" cy="9" r="3.6"/><circle cx="24" cy="9" r="3.6"/><circle cx="39" cy="9" r="3.6"/>
      <circle cx="39" cy="24" r="3.6"/><circle cx="39" cy="39" r="3.6"/><circle cx="24" cy="39" r="3.6"/>
      <circle cx="9" cy="39" r="3.6"/><circle cx="9" cy="24" r="3.6"/><circle cx="24" cy="24" r="4.6"/>
    </g>`,
  // Activity that feeds back on itself and keeps going: a loop with echoes.
  loop: `
    <circle class="e-ripple" cx="24" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle class="e-ripple e-ripple-2" cx="24" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <g class="e-orbit">
      <path d="M24 5.5A18.5 18.5 0 1 1 8 14.75" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M9.7 11.8 10 18.4 3.9 14.9Z" fill="currentColor"/>
    </g>
    <circle cx="24" cy="24" r="4.5" fill="currentColor"/>`,
};

export function emblemSvg(id, className = "") {
  return `<svg class="emblem emblem-${id} ${className}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${PARTS[id] || ""}</svg>`;
}
