(function () {
    'use strict';
    const ledger = document.getElementById('article-ledger');
    if (!ledger) return;
    const nav = Array.from(document.querySelectorAll('.collection-link[data-collection]'));
    const stackNames = new Map(nav.map(link => [link.dataset.collection, link.dataset.name]));
    const rows = Array.from(ledger.querySelectorAll('[data-article]'), (element, index) => {
        const { title, stack, date } = element.dataset;
        const tags = JSON.parse(element.dataset.tags || '[]');
        const link = element.querySelector('h2 a');
        const searchable = [title, ...tags, stackNames.get(stack)].join(' ').toLocaleLowerCase();
        return { element, index, title, stack, date, tags, link, searchable, sections: [], hits: [] };
    });
    const rowsByURL = new Map(rows.map(row => [row.link.href, row]));
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
    const routes = document.getElementById('series-routes');
    const picker = routes.querySelector('.series-picker');
    const pickers = new Map(Array.from(picker.querySelectorAll('button'), button => [button.dataset.pickSeries, button]));
    const groups = Array.from(routes.querySelectorAll('.series-route'), element => ({
        element, count: element.querySelector('[data-route-count]'), button: pickers.get(element.dataset.series),
        start: element.querySelector('.series-start'),
        items: Array.from(element.querySelectorAll('li'), li => {
            const link = li.querySelector('a');
            return { li, link, title: link.textContent, row: rowsByURL.get(link.href) };
        })
    }));
    const modes = document.querySelectorAll('[data-mode]');
    const kinds = document.querySelectorAll('button[data-kind]');
    const pageSize = 10;
    const knownStacks = nav.map(item => item.dataset.collection);
    const collectionMarkers = { all: 'ORBITAL ARCHIVE', cfs: 'FLIGHT SOFTWARE', arm: 'PROCESSOR SYSTEMS', eds: 'SPACE DATA SYSTEMS', linux: 'KERNEL INTERNALS', ebpf: 'SYSTEM OBSERVABILITY', tools: 'ENGINEERING TOOLKIT' };
    let state = { stack: 'all', q: '', order: 'newest', tag: '', mode: 'articles', kind: '' };
    let visibleCount = pageSize;
    let searchTimer;
    let selectedSeries = '';
    let sectionsLoaded = false, sectionsLoading = false, failedQuery = '';
    const historyKey = 'gokoExplorerV46';

    // Fetch only on a real query. The ordinary title and tag index works immediately.
    async function loadSections() {
        sectionsLoading = true;
        try {
            const response = await fetch(ledger.dataset.sectionsUrl, { cache: 'no-cache' });
            if (!response.ok) throw new Error('Section index unavailable');
            const index = await response.json();
            for (const row of rows) {
                row.sections = (index[row.link.getAttribute('href')] || []).map(section => ({
                    ...section, searchable: section.text.toLocaleLowerCase()
                }));
            }
            sectionsLoaded = true;
        } catch (_) {
            failedQuery = state.q;
        } finally {
            sectionsLoading = false;
            if (state.q.trim()) render(false);
        }
    }

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
        selectedSeries = params.get('series') || '';
        state = {
            stack: knownStacks.includes(stack) ? stack : 'all',
            q: params.get('q') || '',
            order: params.get('order') === 'oldest' ? 'oldest' : 'newest',
            tag: params.get('tag') || '',
            mode: params.get('view') === 'series' ? 'series' : 'articles',
            kind: Array.from(kinds).some(b => b.dataset.kind === params.get('kind')) ? params.get('kind') : ''
        };
        query.value = state.q;
        order.value = state.order;
        const saved = savedVisit();
        visibleCount = saved && Number.isFinite(saved.visibleCount)
            ? Math.max(pageSize, Math.min(rows.length, saved.visibleCount)) : pageSize;
    }
    function writeLocation() {
        const url = new URL(window.location.href);
        ['stack', 'q', 'order', 'tag', 'view', 'kind', 'series'].forEach(key => url.searchParams.delete(key));
        if (state.stack !== 'all') url.searchParams.set('stack', state.stack);
        if (state.kind) url.searchParams.set('kind', state.kind);
        if (state.mode === 'series') {
            url.searchParams.set('view', 'series');
            if (selectedSeries) url.searchParams.set('series', selectedSeries);
        }
        if (state.q) url.searchParams.set('q', state.q);
        if (state.order !== 'newest') url.searchParams.set('order', state.order);
        if (state.tag) url.searchParams.set('tag', state.tag);
        rememberVisit(url.pathname + url.search + url.hash);
    }
    function showMatches(link, title, matcher) {
        if (!matcher) {
            if (link.childElementCount || link.textContent !== title) link.textContent = title;
            return;
        }
        const fragment = document.createDocumentFragment();
        title.split(matcher).forEach((part, i) => {
            if (i % 2 === 0) fragment.append(part);
            else {
                const mark = document.createElement('mark');
                mark.textContent = part;
                fragment.append(mark);
            }
        });
        link.replaceChildren(fragment);
    }

    function showSectionLinks(after, row, matcher) {
        if (!row.hits.length) return;
        const box = document.createElement('div');
        box.className = 'section-matches';
        function list(items) {
            const ul = document.createElement('ul');
            for (const section of items) {
                const li = document.createElement('li');
                const link = document.createElement('a');
                link.className = 'entry-title-link';
                link.href = row.link.href + '#' + encodeURIComponent(section.id);
                showMatches(link, section.text, matcher);
                li.append(link);
                ul.append(li);
            }
            return ul;
        }
        box.append(list(row.hits.slice(0, 2)));
        if (row.hits.length > 2) {
            const more = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = '另有 ' + (row.hits.length - 2) + ' 个匹配小节';
            more.append(summary);
            more.addEventListener('toggle', () => {
                if (more.open && !more.querySelector('ul')) more.append(list(row.hits.slice(2)));
            });
            box.append(more);
        }
        after.after(box);
    }

    function render(animate) {
        document.body.dataset.collection = state.stack;
        document.getElementById('collection-marker').textContent = collectionMarkers[state.stack];
        window.dispatchEvent(new CustomEvent('explorer:collection', { detail: { id: state.stack } }));
        const words = state.q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
        if (!words.length) failedQuery = '';
        else if (!sectionsLoaded && !sectionsLoading && failedQuery !== state.q) loadSections();
        document.querySelectorAll('.section-matches').forEach(element => element.remove());
        const pattern = [...new Set(words)].sort((a, b) => b.length - a.length)
            .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const matcher = pattern ? new RegExp('(' + pattern + ')', 'iu') : null;
        const candidates = rows.filter(row => {
            if (state.stack !== 'all' && state.stack !== row.stack) return false;
            if (state.tag && !row.tags.includes(state.tag)) return false;
            const missing = words.filter(word => !row.searchable.includes(word));
            const sectionTerms = missing.length ? missing : words;
            row.hits = sectionTerms.length ? row.sections.filter(section =>
                sectionTerms.every(word => section.searchable.includes(word))) : [];
            return !missing.length || row.hits.length > 0;
        });
        kinds.forEach(button => {
            const kind = button.dataset.kind;
            button.hidden = state.kind !== kind && !candidates.some(row => row.element.dataset.kind === kind);
            button.setAttribute('aria-pressed', String(state.kind === kind));
        });
        const matching = candidates.filter(row => !state.kind || row.element.dataset.kind === state.kind).sort((a, b) => {
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
            if (index < visibleCount && state.mode === 'articles') {
                showMatches(row.link, row.title, matcher);
                showSectionLinks(row.link.parentElement, row, matcher);
            }
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
        const isFiltered = state.stack !== 'all' || state.q || state.tag || state.kind || state.mode === 'series';
        status.textContent = isFiltered ? `找到 ${matching.length} 篇文章` : `共 ${matching.length} 篇文章`;
        const total = document.querySelector('.index-total');
        const collectionDates = rows.filter(row => state.stack === 'all' || row.stack === state.stack)
            .map(row => row.date.slice(0, 7)).sort();
        const first = collectionDates[0], last = collectionDates[collectionDates.length - 1];
        total.querySelector('strong').textContent = collectionDates.length;
        total.setAttribute('aria-label', `共 ${collectionDates.length} 篇文章`);
        document.getElementById('collection-period').textContent = first === last ? first || '' : first + ' — ' + last;
        empty.hidden = matching.length !== 0;
        ledger.hidden = matching.length === 0;
        more.hidden = matching.length <= visibleCount;
        more.innerHTML = `继续展开 <span>↓</span>`;
        more.setAttribute('aria-label', `继续展开，剩余 ${Math.max(0, matching.length - visibleCount)} 篇文章`);
        end.hidden = matching.length > visibleCount || matching.length === 0;
        resets.forEach(button => { if (button.classList.contains('reset-button')) button.hidden = !isFiltered && state.order === 'newest'; });
        const seriesMode = state.mode === 'series';
        modes.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
        const eligible = new Set(matching);
        const wasBrowsing = !picker.hidden;
        picker.hidden = !seriesMode;
        routes.classList.toggle('is-browsing', seriesMode);
        const available = [];
        let chapterCount = 0;
        for (const group of groups) {
            let count = 0;
            for (const item of group.items) {
                item.li.hidden = !eligible.has(item.row);
                if (!item.li.hidden) {
                    count++;
                    showMatches(item.link, item.title, matcher);
                    if (seriesMode) showSectionLinks(item.link, item.row, matcher);
                }
            }
            group.element.hidden = count === 0;
            group.count.textContent = count === group.items.length ? count + ' 篇' : count + ' / ' + group.items.length + ' 篇';
            group.button.hidden = !count;
            group.button.querySelector('small').textContent = group.count.textContent;
            if (count) {
                available.push(group);
                const first = group.items.find(item => !item.li.hidden);
                group.start.href = first.link.href;
                group.start.textContent = first === group.items[0] ? '从第一篇读起 →' : '阅读首个匹配章节 →';
            }
            if (!seriesMode && wasBrowsing) group.element.open = false;
            chapterCount += count;
        }
        const groupCount = available.length;
        routes.hidden = !groupCount || (!seriesMode && (state.stack === 'all' || words.length > 0));
        if (seriesMode) {
            const selectedGroup = available.find(group => group.element.dataset.series === selectedSeries) || available[0];
            for (const group of available) {
                const chosen = group === selectedGroup;
                group.button.setAttribute('aria-pressed', String(chosen));
                group.element.open = chosen;
                group.element.hidden = !chosen;
            }
            status.textContent = groupCount + ' 个系列 · ' + chapterCount + ' 篇章节';
            ledger.hidden = more.hidden = end.hidden = true;
            empty.hidden = groupCount > 0;
        }
        if (words.length && !sectionsLoaded) {
            if (sectionsLoading) {
                status.textContent = matching.length ? status.textContent + ' · 正在检索小节' : '正在检索文章小节…';
                empty.hidden = true;
            } else status.textContent += ' · 小节索引暂不可用';
        }
        order.disabled = seriesMode;
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
        selectedSeries = '';
        state.kind = '';
        state.tag = '';
        update();
    }));
    picker.addEventListener('click', event => {
        const button = event.target.closest('[data-pick-series]');
        if (!button) return;
        selectedSeries = button.dataset.pickSeries;
        writeLocation();
        render(false);
    });
    modes.forEach(button => button.addEventListener('click', () => { state.mode = button.dataset.mode; update(); }));
    kinds.forEach(button => button.addEventListener('click', () => {
        state.kind = state.kind === button.dataset.kind ? '' : button.dataset.kind;
        update();
    }));
    query.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.q = query.value.trim();
            update(false);
        }, 120);
    });
    query.addEventListener('keydown', event => {
        if (event.key !== 'ArrowDown' || event.isComposing) return;
        if (state.q !== query.value.trim()) {
            clearTimeout(searchTimer);
            state.q = query.value.trim();
            update(false);
        }
        const first = state.mode === 'series' ? picker.querySelector('button[aria-pressed=true]:not([hidden])')
            : ledger.querySelector('[data-article]:not([hidden]) h2 a');
        if (first) { event.preventDefault(); first.focus(); }
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
        selectedSeries = '';
        state = { stack: 'all', q: '', order: 'newest', tag: '', mode: 'articles', kind: '' };
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
