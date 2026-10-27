(function () {
    'use strict';
    const ledger = document.getElementById('article-ledger');
    if (!ledger) return;
    const rows = Array.from(ledger.querySelectorAll('[data-article]')).map((element, index) => ({
        element, index, title: element.dataset.title, stack: element.dataset.stack,
        tags: JSON.parse(element.dataset.tags || '[]'), date: element.dataset.date
    }));
    const nav = Array.from(document.querySelectorAll('.collection-link[data-collection]'));
    const query = document.getElementById('article-query');
    const order = document.getElementById('article-order');
    const title = document.getElementById('collection-title');
    const description = document.getElementById('collection-description');
    const status = document.getElementById('article-status');
    const empty = document.getElementById('empty-state');
    const more = document.getElementById('load-more');
    const end = document.getElementById('index-end');
    const activeTag = document.getElementById('active-tag');
    const resets = Array.from(document.querySelectorAll('[data-reset]'));
    const pageSize = 10;
    const knownStacks = nav.map(item => item.dataset.collection);
    const collectionMarkers = { all: 'ORBITAL ARCHIVE', cfs: 'FLIGHT SOFTWARE', arm: 'PROCESSOR SYSTEMS', eds: 'SPACE DATA SYSTEMS', linux: 'KERNEL INTERNALS', ebpf: 'SYSTEM OBSERVABILITY', tools: 'ENGINEERING TOOLKIT' };
    let state = { stack: 'all', q: '', order: 'newest', tag: '' };
    let visibleCount = pageSize;
    let searchTimer;
    const historyKey = 'gokoExplorerV46';

    function savedVisit() {
        const saved = window.history.state && window.history.state[historyKey];
        return saved && saved.url === location.pathname + location.search ? saved : null;
    }
    function rememberVisit(url = location.pathname + location.search + location.hash) {
        // Keep state on this history entry, not globally: a new /explore/ stays unfiltered.
        const entry = Object.assign({}, window.history.state);
        entry[historyKey] = {
            url: url.split('#')[0],
            visibleCount,
            scrollY: window.scrollY
        };
        window.history.replaceState(entry, '', url);
    }

    function readLocation() {
        const params = new URLSearchParams(window.location.search);
        const stack = params.get('stack') || 'all';
        state = {
            stack: knownStacks.includes(stack) ? stack : 'all',
            q: params.get('q') || '',
            order: params.get('order') === 'oldest' ? 'oldest' : 'newest',
            tag: params.get('tag') || ''
        };
        query.value = state.q;
        order.value = state.order;
        const saved = savedVisit();
        visibleCount = saved && Number.isFinite(saved.visibleCount)
            ? Math.max(pageSize, Math.min(rows.length, saved.visibleCount)) : pageSize;
    }
    function writeLocation() {
        const url = new URL(window.location.href);
        ['stack', 'q', 'order', 'tag'].forEach(key => url.searchParams.delete(key));
        if (state.stack !== 'all') url.searchParams.set('stack', state.stack);
        if (state.q) url.searchParams.set('q', state.q);
        if (state.order !== 'newest') url.searchParams.set('order', state.order);
        if (state.tag) url.searchParams.set('tag', state.tag);
        rememberVisit(url.pathname + url.search + url.hash);
    }
    function render(animate) {
        document.body.dataset.collection = state.stack;
        document.getElementById('collection-marker').textContent = collectionMarkers[state.stack];
        window.dispatchEvent(new CustomEvent('explorer:collection', { detail: { id: state.stack } }));
        const words = state.q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
        const matching = rows.filter(row => {
            if (state.stack !== 'all' && state.stack !== row.stack) return false;
            if (state.tag && !row.tags.includes(state.tag)) return false;
            const label = nav.find(item => item.dataset.collection === row.stack);
            const searchable = [row.title, ...row.tags, label ? label.dataset.name : ''].join(' ').toLocaleLowerCase();
            return words.every(word => searchable.includes(word));
        }).sort((a, b) => {
            const difference = a.date.localeCompare(b.date);
            return (state.order === 'oldest' ? difference : -difference) || a.index - b.index;
        });
        rows.forEach(row => {
            row.element.hidden = true;
            row.element.classList.remove('is-entering');
        });
        matching.forEach((row, index) => {
            ledger.appendChild(row.element);
            row.element.hidden = index >= visibleCount;
            row.element.style.setProperty('--entry-order', Math.min(index, 9));
            if (animate && index < visibleCount) row.element.classList.add('is-entering');
        });
        nav.forEach(link => {
            const selected = link.dataset.collection === state.stack;
            link.classList.toggle('is-active', selected);
            if (selected) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        const selected = nav.find(link => link.dataset.collection === state.stack);
        title.textContent = selected.dataset.name;
        description.textContent = selected.dataset.description;
        const isFiltered = state.stack !== 'all' || state.q || state.tag;
        status.textContent = isFiltered ? `找到 ${matching.length} 篇文章` : `共 ${matching.length} 篇文章`;
        const total = document.querySelector('.index-total');
        total.querySelector('strong').textContent = String(matching.length).padStart(2, '0');
        total.setAttribute('aria-label', `共 ${matching.length} 篇文章`);
        empty.hidden = matching.length !== 0;
        ledger.hidden = matching.length === 0;
        more.hidden = matching.length <= visibleCount;
        more.innerHTML = `继续展开 <span>↓</span>`;
        more.setAttribute('aria-label', `继续展开，剩余 ${Math.max(0, matching.length - visibleCount)} 篇文章`);
        end.hidden = matching.length > visibleCount || matching.length === 0;
        resets.forEach(button => { if (button.classList.contains('reset-button')) button.hidden = !isFiltered && state.order === 'newest'; });
        activeTag.hidden = !state.tag;
        activeTag.textContent = state.tag ? `#${state.tag} ×` : '';
        activeTag.setAttribute('aria-label', `移除标签筛选 ${state.tag}`);
        document.querySelectorAll('[data-tag]').forEach(link => link.classList.toggle('is-active', link.dataset.tag === state.tag));
    }
    function update(animate = true) {
        visibleCount = pageSize;
        writeLocation();
        render(animate);
    }
    nav.forEach(link => link.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        state.stack = link.dataset.collection;
        state.tag = '';
        update();
    }));
    query.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.q = query.value.trim();
            update(false);
        }, 120);
    });
    order.addEventListener('change', () => { state.order = order.value; update(); });
    document.querySelectorAll('[data-tag]').forEach(link => link.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        state.tag = state.tag === link.dataset.tag ? '' : link.dataset.tag;
        update();
        document.getElementById('article-index').scrollIntoView({ block: 'start' });
    }));
    activeTag.addEventListener('click', () => { state.tag = ''; update(); });
    resets.forEach(button => button.addEventListener('click', () => {
        clearTimeout(searchTimer);
        state = { stack: 'all', q: '', order: 'newest', tag: '' };
        query.value = '';
        order.value = 'newest';
        update();
    }));
    more.addEventListener('click', () => {
        const previousCount = visibleCount;
        visibleCount += pageSize;
        render(false);
        rememberVisit();
        const next = Array.from(ledger.querySelectorAll('[data-article]:not([hidden])'))[previousCount];
        if (next) {
            const link = next.querySelector('h2 a');
            link.focus({ preventScroll: true });
        }
    });
    document.addEventListener('keydown', event => {
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
        if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !typing)) {
            event.preventDefault();
            query.focus();
            query.select();
        }
        if (event.key === 'Escape' && document.activeElement === query) query.blur();
    });
    window.addEventListener('popstate', () => { clearTimeout(searchTimer); readLocation(); render(false); });
    // Save before navigation as well as pagehide; no continuously running scroll handler.
    ledger.addEventListener('click', event => {
        if (event.target.closest('.entry-title-link')) rememberVisit();
    });
    window.addEventListener('pagehide', () => { clearTimeout(searchTimer); rememberVisit(); });
    window.addEventListener('pageshow', event => {
        // BFCache already preserves the DOM and scroll. Leave its restoration untouched.
        if (event.persisted) return;
        const saved = savedVisit();
        const navigation = performance.getEntriesByType('navigation')[0];
        if (!saved || !navigation || !['back_forward', 'reload'].includes(navigation.type) || location.hash) return;
        requestAnimationFrame(() => {
            // Native restoration normally wins; only fill in a missing restored position.
            if (window.scrollY === 0 && Number.isFinite(saved.scrollY) && saved.scrollY > 0) {
                window.scrollTo({ top: saved.scrollY, behavior: 'instant' });
            }
        });
    });
    document.querySelectorAll('[data-enhanced]').forEach(element => { element.hidden = false; });
    readLocation();
    render(!savedVisit());
    if (new URLSearchParams(location.search).get('focus') === 'search') query.focus();
})();
