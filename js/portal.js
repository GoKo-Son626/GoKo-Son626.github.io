/* Progressive enhancement: the generated HTML contains every article link. */
(() => {
  'use strict';
  const body = document.body;
  const rows = Array.from(document.querySelectorAll('[data-note]'));
  const filters = Array.from(document.querySelectorAll('[data-filter]'));
  const query = document.getElementById('note-query');
  const sort = document.getElementById('note-sort');
  const list = document.getElementById('note-list');
  const more = document.getElementById('load-more');
  const summary = document.getElementById('notes-result');
  const empty = document.getElementById('notes-empty');
  const dialog = document.getElementById('search-dialog');
  const globalQuery = document.getElementById('global-query');
  const globalResults = document.getElementById('global-results');
  const globalStatus = document.getElementById('global-search-status');
  const menu = document.getElementById('portal-nav');
  const menuButton = document.querySelector('[data-menu]');
  const motionButton = document.querySelector('[data-motion]');
  const groupIds = filters.map(button => button.dataset.filter);
  const pageSize = 8;
  const normalise = value => value.toLocaleLowerCase().normalize('NFKC').trim();
  const notes = rows.map((row, index) => ({
    row, index, stack: row.dataset.stack, title: row.dataset.title,
    text: normalise(row.dataset.title + ' ' + row.dataset.tags + ' ' + row.querySelector('.note-stack').textContent),
    date: row.dataset.date, url: row.querySelector('h3 a').getAttribute('href')
  }));
  let activeGroup = 'all';
  let visibleCount = pageSize;
  let selectedResult = -1;
  let lastFocus = null;
  body.classList.add('has-js');

  function readState() {
    const params = new URLSearchParams(window.location.search);
    activeGroup = groupIds.includes(params.get('stack')) ? params.get('stack') : 'all';
    query.value = params.get('q') || '';
    sort.value = params.get('order') === 'oldest' ? 'oldest' : 'newest';
  }

  function writeState() {
    const url = new URL(window.location.href);
    if (activeGroup === 'all') url.searchParams.delete('stack');
    else url.searchParams.set('stack', activeGroup);
    if (query.value.trim()) url.searchParams.set('q', query.value.trim());
    else url.searchParams.delete('q');
    if (sort.value === 'oldest') url.searchParams.set('order', 'oldest');
    else url.searchParams.delete('order');
    window.history.replaceState(null, '', url);
  }

  function findNotes(search, group = 'all') {
    const words = normalise(search).split(/\s+/).filter(Boolean);
    return notes.filter(note => (group === 'all' || note.stack === group) && words.every(word => note.text.includes(word)));
  }

  function renderNotes() {
    const matching = findNotes(query.value, activeGroup).sort((a, b) => sort.value === 'oldest' ? b.index - a.index : a.index - b.index);
    const visible = new Set(matching.slice(0, visibleCount));
    notes.forEach(note => { note.row.hidden = !visible.has(note); });
    // Move the existing nodes so keyboard and visual order remain identical.
    matching.forEach(note => list.appendChild(note.row));
    filters.forEach(button => {
      const active = button.dataset.filter === activeGroup;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('.dock-item').forEach(link => link.classList.toggle('is-active', link.dataset.stackLink === activeGroup));
    const label = activeGroup === 'all' ? '全部方向' : filters.find(button => button.dataset.filter === activeGroup).dataset.label;
    const count = Math.min(matching.length, visibleCount);
    summary.textContent = `${label} · ${matching.length} 篇笔记 · 已显示 ${count} 篇`;
    empty.hidden = matching.length !== 0;
    more.hidden = matching.length <= visibleCount;
    more.textContent = `再看 ${Math.min(pageSize, matching.length - visibleCount)} 篇笔记 ↓`;
    document.querySelectorAll('[data-reset]').forEach(button => { button.hidden = activeGroup === 'all' && !query.value.trim() && sort.value === 'newest'; });
  }

  function changeGroup(group) {
    activeGroup = groupIds.includes(group) ? group : 'all';
    visibleCount = pageSize;
    writeState();
    renderNotes();
  }

  filters.forEach(button => button.addEventListener('click', () => {
    query.value = '';
    changeGroup(button.dataset.filter);
    document.getElementById('notes').scrollIntoView({ behavior: body.classList.contains('motion-paused') || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }));
  document.querySelectorAll('[data-stack-link]').forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    query.value = '';
    sort.value = 'newest';
    changeGroup(link.dataset.stackLink);
    const url = new URL(window.location.href);
    url.hash = 'notes';
    window.history.replaceState(null, '', url);
    document.getElementById('notes').scrollIntoView({ behavior: body.classList.contains('motion-paused') || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }));
  query.addEventListener('input', () => { visibleCount = pageSize; writeState(); renderNotes(); });
  sort.addEventListener('change', () => { visibleCount = pageSize; writeState(); renderNotes(); });
  more.addEventListener('click', () => {
    const previousCount = visibleCount;
    visibleCount += pageSize;
    renderNotes();
    const firstNew = Array.from(list.querySelectorAll('[data-note]:not([hidden])'))[previousCount];
    if (firstNew) firstNew.querySelector('h3 a').focus({ preventScroll: true });
  });
  document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => {
    query.value = ''; sort.value = 'newest'; changeGroup('all'); query.focus({ preventScroll: true });
  }));
  window.addEventListener('popstate', () => { readState(); visibleCount = pageSize; renderNotes(); });
  readState(); renderNotes();

  function closeMenu() {
    menu.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', '展开导航');
  }
  menuButton.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? '收起导航' : '展开导航');
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('click', event => { if (!event.target.closest('.portal-header')) closeMenu(); });

  function updatePaletteButton() {
    const isLight = document.documentElement.dataset.palette === 'light';
    const button = document.querySelector('[data-palette-toggle]');
    button.setAttribute('aria-label', isLight ? '切换深色主题' : '切换浅色主题');
    button.title = button.getAttribute('aria-label');
    document.querySelector('meta[name="theme-color"]').content = isLight ? '#eef1f1' : '#080b10';
  }
  document.querySelector('[data-palette-toggle]').addEventListener('click', () => {
    const palette = document.documentElement.dataset.palette === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.palette = palette;
    try { localStorage.setItem('goko-v3-palette', palette); } catch (_) { /* Storage may be unavailable. */ }
    updatePaletteButton();
  });
  updatePaletteButton();
  // Keep V3 preferences isolated from the other layout candidates.
  try { localStorage.setItem('goko-v3-palette', document.documentElement.dataset.palette || 'dark'); } catch (_) { /* No persistence. */ }

  let motionPaused = false;
  try { motionPaused = localStorage.getItem('goko-v3-motion-paused') === 'true'; } catch (_) { /* No persistence. */ }
  function updateMotion() {
    body.classList.toggle('motion-paused', motionPaused);
    motionButton.setAttribute('aria-pressed', String(motionPaused));
    motionButton.setAttribute('aria-label', motionPaused ? '恢复背景动画' : '暂停背景动画');
    motionButton.title = motionButton.getAttribute('aria-label');
    motionButton.firstElementChild.textContent = motionPaused ? '▷' : 'Ⅱ';
  }
  motionButton.addEventListener('click', () => {
    motionPaused = !motionPaused;
    try { localStorage.setItem('goko-v3-motion-paused', String(motionPaused)); } catch (_) { /* No persistence. */ }
    updateMotion();
  });
  updateMotion();

  function renderGlobalResults() {
    const found = findNotes(globalQuery.value);
    const results = found.slice(0, 30);
    globalResults.replaceChildren();
    selectedResult = -1;
    globalStatus.textContent = globalQuery.value.trim()
      ? `找到 ${found.length} 篇笔记${found.length > 30 ? '，显示前 30 篇；可继续输入以缩小范围' : ''}`
      : '最近的笔记 · 输入关键词查找所有文章';
    results.forEach(note => {
      const link = document.createElement('a');
      link.className = 'global-result';
      link.href = note.url;
      const title = document.createElement('span');
      title.className = 'global-result-title';
      title.textContent = note.title;
      const meta = document.createElement('span');
      meta.className = 'global-result-meta';
      meta.textContent = `${note.row.querySelector('.note-stack').textContent} / ${note.date}`;
      link.append(title, meta);
      globalResults.appendChild(link);
    });
  }
  function openSearch() {
    if (typeof dialog.showModal !== 'function') {
      document.getElementById('notes').scrollIntoView(); query.focus(); return;
    }
    if (dialog.open) return;
    lastFocus = document.activeElement;
    closeMenu();
    globalQuery.value = '';
    renderGlobalResults();
    dialog.showModal();
    body.style.overflow = 'hidden';
    globalQuery.focus();
  }
  document.querySelectorAll('[data-search-open]').forEach(button => button.addEventListener('click', openSearch));
  document.querySelector('[data-search-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { body.style.overflow = ''; if (lastFocus) lastFocus.focus({ preventScroll: true }); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  globalQuery.addEventListener('input', renderGlobalResults);
  globalQuery.addEventListener('keydown', event => {
    const links = Array.from(globalResults.querySelectorAll('a'));
    if (!links.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      selectedResult = event.key === 'ArrowDown' ? (selectedResult + 1) % links.length : (selectedResult < 0 ? links.length - 1 : (selectedResult - 1 + links.length) % links.length);
      links.forEach((link, index) => link.classList.toggle('is-selected', index === selectedResult));
      links[selectedResult].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && selectedResult >= 0) {
      event.preventDefault(); links[selectedResult].click();
    }
  });
  document.addEventListener('keydown', event => {
    const inputFocused = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !inputFocused)) {
      event.preventDefault(); openSearch();
    }
    if (event.key === 'Escape') {
      if (dialog.open) {
        event.preventDefault();
        dialog.close();
      } else {
        closeMenu();
      }
    }
  });
  // A single passive scroll handler updates the thin reading progress line.
  const progress = document.querySelector('.reading-progress');
  let scrollQueued = false;
  function updateProgress() {
    const length = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = `scaleX(${length > 0 ? Math.min(1, window.scrollY / length) : 0})`;
    scrollQueued = false;
  }
  window.addEventListener('scroll', () => {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(updateProgress); }
  }, { passive: true });
  updateProgress();
  const hint = document.querySelector('.search-trigger kbd');
  if (hint) hint.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';

  // Pointer feedback is limited to hover devices and respects reduced motion.
  if (window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) {
    document.querySelectorAll('.glow-card').forEach(card => card.addEventListener('pointermove', event => {
      if (body.classList.contains('motion-paused')) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`);
    }));
  }
})();
