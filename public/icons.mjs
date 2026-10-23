const paths = {
  library: '<path d="M4 4h5v16H4zM11 4h4v16h-4zM17 5l3-1 4 15-3 1z"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  review: '<rect x="3" y="3" width="14" height="17" rx="2"/><path d="m7 13 3 3 7-8M20 8h2v13h-9"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5z"/>',
  compare: '<path d="M10 3v18M3 7h4m-4 5h4m-4 5h4M14 7h7m-7 5h7m-7 5h7"/>',
  undo: '<path d="M4 10h10a6 6 0 0 1 0 12M4 10l6-6M4 10l6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="m9.5 3-.6 2.3-2 .9-2.2-.7-2.4 4.1 1.7 1.7v2.3l-1.7 1.7 2.4 4.1 2.2-.7 2 .9.6 2.3h5l.6-2.3 2-.9 2.2.7 2.4-4.1-1.7-1.7v-2.3l1.7-1.7-2.4-4.1-2.2.7-2-.9-.6-2.3z"/><circle cx="12" cy="12" r="3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  spark: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z"/>',
  'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  'arrow-up': '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2l-1.5 1v2M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  paperclip: '<path d="m9 12 6-6a3.5 3.5 0 0 1 5 5L10 21a5 5 0 0 1-7-7L13 4a2 2 0 0 1 3 3L6 17"/>',
  history: '<path d="M3 11a9 9 0 1 1 3 7M3 4v7h7M12 7v5l3 2"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7-2.6M12 14v3"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a3.5 3.5 0 0 0-5-5L4 14z"/>',
  pen: '<path d="m12 19 8-8-7-7-8 8-2 9zM3 21l7-7"/><circle cx="11.5" cy="12.5" r="1.5"/><path d="m15 2 7 7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  light: '<circle cx="12" cy="10" r="5"/><path d="M9 15v3h6v-3M10 21h4M12 1v1M3 10H1m22 0h-2M4 3l2 2m12 0 2-2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4c-1-1 0-3 2-3h2a3 3 0 0 0 3-3 9 9 0 0 0-9-8Z"/><path d="M7 10h.01M10 6h.01M15 6h.01M18 10h.01"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
};
export function icon(name) {
  const template = document.createElement('template');
  template.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
  return template.content.firstElementChild;
}
export function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => el.replaceChildren(icon(el.dataset.icon))); }
