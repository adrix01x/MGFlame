const paths = {
  mark: '<path d="M12 2c.7 4.5 7 6.5 7 12a7 7 0 1 1-14 0c0-3.2 1.9-6.1 4-8-.1 2.6.8 4 1.9 4.6C12 8.6 12.6 5.3 12 2Z"/><path d="M12 20.7c-1.7 0-3-1.3-3-3 0-1.9 1.9-3.3 3-5 1 1.8 3 3.2 3 5 0 1.7-1.3 3-3 3Z"/>',
  grid: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><rect x="14" y="14" width="6.5" height="6.5" rx="1"/>',
  flask: '<path d="M9 3h6m-5 0v7l-5.8 8.5a1.6 1.6 0 0 0 1.3 2.5h13a1.6 1.6 0 0 0 1.3-2.5L14 10V3m-6.5 12h9"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  book: '<path d="M12 6.5C9.8 4.5 6.3 4.2 3.5 5v13.5c2.8-.8 6.3-.5 8.5 1.5 2.2-2 5.7-2.3 8.5-1.5V5c-2.8-.8-6.3-.5-8.5 1.5Zm0 0V20"/>',
  spark: '<path d="M11 2.5l1.9 5.6 5.6 1.9-5.6 1.9-1.9 5.6-1.9-5.6L3.5 10l5.6-1.9L11 2.5Zm7.5 11.5 1 2.5L22 17.5l-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z"/>',
  external: '<path d="M13 5h6v6m0-6-8 8m6 0v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/>',
  "chevron-right": '<path d="m9 6 6 6-6 6"/>',
  "chevron-left": '<path d="m15 6-6 6 6 6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "arrow-right": '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  "arrow-up-right": '<path d="M6 18 18 6M8 6h10v10"/>',
  download: '<path d="M12 3.5V15m-4-4 4 4 4-4M4.5 16v3a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-3"/>',
  chart: '<path d="M4 4v15a1 1 0 0 0 1 1h15M8 15v-4m5 4V6m5 9V9"/>',
  database: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  alert: '<path d="m10.5 4-8 14a1.4 1.4 0 0 0 1.2 2h16.6a1.4 1.4 0 0 0 1.2-2l-8-14a1.7 1.7 0 0 0-3 0ZM12 9v4m0 3.1v.4"/>',
  bulb: '<path d="M8.5 15.5V14a6 6 0 1 1 7 0v1.5M8.5 17h7m-5 3h3"/>',
  radar: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.4"/><path d="m12 12 7-7"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  shield: '<path d="M12 3 4.5 6v5c0 5 3 8.3 7.5 10 4.5-1.7 7.5-5 7.5-10V6L12 3Z"/><path d="m9 12 2 2 4-4"/>',
  flow: '<path d="M3 7h12a2 2 0 1 0-2-2M3 12h16a2 2 0 1 0-2-2M3 17h9a2 2 0 1 1-2 2"/>',
  flame: '<path d="M12 3c.4 4.2 6.7 6.2 6.7 12a6.7 6.7 0 1 1-13.4 0c0-3.1 1.8-5.7 3.8-7.4-.2 2.5.6 3.5 1.5 4C12 9.4 12.4 6.6 12 3Z"/>',
  cross: '<path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  moon: '<path d="M20.5 14.4A8.7 8.7 0 0 1 9.6 3.5a8.8 8.8 0 1 0 10.9 10.9Z"/>',
  planet: '<circle cx="12" cy="12" r="7"/><path d="M17 6c2.3-.6 3.8-.5 4.2.3.9 1.5-2.5 5.3-7.7 8.3-5 3-9.9 4.3-10.8 2.8-.5-.9.2-2.2 1.9-3.8"/>',
  filter: '<path d="M4 6h16M7 12h10m-7 6h4"/>',
  sort: '<path d="M7 4v16m-3-3 3 3 3-3M17 20V4m-3 3 3-3 3 3"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  file: '<path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3Zm8 0v5h4m-9 5h6m-6 4h6"/>',
  play: '<path d="m9 5 11 7-11 7z"/>',
  pause: '<path d="M8 5v14m8-14v14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  send: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
};

export function icon(name, className = "") {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.info}</svg>`;
}

export function initIcons() {
  for (const node of document.querySelectorAll("[data-icon]")) {
    node.innerHTML = icon(node.dataset.icon);
  }
}
