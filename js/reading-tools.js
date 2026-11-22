// Article-local controls keep their state in this browser.
(() => {
    const article = document.querySelector('article.article');
    if (!article) return;
    const dock = article.querySelector('.reading-dock');
    if (!dock) return;
    dock.hidden = false;
    const returnLink = dock.querySelector('.reader-search-return');
    const collection = document.querySelector('.reader-collection');
    if (returnLink && collection && document.referrer) {
        const source = new URL(document.referrer);
        const index = new URL(collection.href);
        const query = source.searchParams.get('q');
        if (source.origin === location.origin && source.pathname === index.pathname && (query || source.searchParams.get('view') === 'series')) {
            source.hash = 'article-index';
            returnLink.href = source.href;
            returnLink.textContent = query ? '← 搜索结果' : '← 系列目录';
            returnLink.hidden = false;
        }
    }
    const focus = dock.querySelector('.focus-reading');
    let placeOutline;
    function setFocus(on) {
        document.body.classList.toggle('immersive-reading', on);
        focus.setAttribute('aria-pressed', String(on));
        focus.textContent = on ? '退出专注' : '专注阅读';
        if (placeOutline) placeOutline();
    }
    focus.addEventListener('click', () => setFocus(focus.getAttribute('aria-pressed') !== 'true'));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && focus.getAttribute('aria-pressed') === 'true' && !document.querySelector('dialog[open]')) setFocus(false);
    });

    // Index the cloned snippet only while its dialog is open. DOM ranges preserve
    // syntax highlighting, including identifiers split across adjacent spans.
    function attachCodeSearch(dialog, pane) {
        const search = dialog.querySelector('.code-search');
        const field = search.querySelector('input');
        const count = search.querySelector('output');
        const previous = search.querySelector('[data-back]');
        const next = search.querySelector('[data-forward]');
        const highlights = window.CSS && CSS.highlights;
        let text = '', runs = [], matches = [], current = 0;
        function clearMark() {
            if (highlights) highlights.delete('goko-code-hit');
            else {
                const selection = window.getSelection();
                if (pane.contains(selection.anchorNode)) selection.removeAllRanges();
            }
        }
        function reveal() {
            clearMark();
            count.textContent = field.value ? (matches.length ? current + 1 : 0) + ' / ' + matches.length : '';
            previous.disabled = next.disabled = matches.length < 2;
            if (!matches.length) return;
            const start = matches[current], end = start + field.value.length;
            const first = runs.find(run => run.end > start);
            const last = runs.find(run => run.end >= end);
            if (!first || !last) return;
            const range = document.createRange();
            range.setStart(first.node, start - first.start);
            range.setEnd(last.node, end - last.start);
            if (highlights) highlights.set('goko-code-hit', new Highlight(range));
            else { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
            const box = range.getBoundingClientRect(), viewport = pane.getBoundingClientRect();
            if (box.top < viewport.top || box.bottom > viewport.bottom)
                pane.scrollTop += box.top - viewport.top - pane.clientHeight / 3;
            if (box.left < viewport.left || box.right > viewport.right)
                pane.scrollLeft += box.left - viewport.left - 24;
        }
        function find() {
            matches = []; current = 0;
            const needle = field.value;
            if (needle) {
                for (let offset = text.indexOf(needle); offset !== -1; offset = text.indexOf(needle, offset + needle.length))
                    matches.push(offset);
            }
            reveal();
        }
        function step(direction) {
            if (!matches.length) return;
            current = (current + direction + matches.length) % matches.length;
            reveal();
        }
        field.addEventListener('input', find);
        previous.addEventListener('click', () => step(-1));
        next.addEventListener('click', () => step(1));
        dialog.addEventListener('keydown', event => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
                event.preventDefault(); field.focus(); field.select();
            } else if (event.target === field && event.key === 'Enter' && !event.isComposing) {
                event.preventDefault(); step(event.shiftKey ? -1 : 1);
            }
        });
        function reset() { clearMark(); runs = []; matches = []; text = ''; field.value = ''; }
        dialog.addEventListener('close', reset);
        return () => {
            reset();
            const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
            let node;
            while ((node = walker.nextNode())) {
                if (node.nodeName === 'BR') text += '\n';
                if (node.nodeType !== Node.TEXT_NODE || !node.length) continue;
                runs.push({ node, start: text.length, end: text.length + node.length });
                text += node.data;
            }
            find();
        };
    }

    let viewer, indexCode;
    function showCode(source, language) {
        if (!viewer) {
            viewer = document.createElement('dialog');
            viewer.className = 'code-viewer';
            viewer.setAttribute('aria-labelledby', 'code-viewer-title');
            viewer.innerHTML = '<header><h2 id="code-viewer-title"></h2><label><input type="checkbox"> 自动换行</label><form method="dialog"><button>关闭 ×</button></form></header><div class="code-search"><input type="search" placeholder="在这段代码中查找" aria-label="在这段代码中查找，区分大小写"><output aria-live="polite"></output><button type="button" aria-label="上一处匹配" data-back>↑</button><button type="button" aria-label="下一处匹配" data-forward>↓</button></div><div class="expanded-code" tabindex="0"></div>';
            viewer.querySelector('input[type=checkbox]').addEventListener('change', event => viewer.classList.toggle('wrap-code', event.target.checked));
            viewer.addEventListener('close', () => viewer.querySelector('.expanded-code').replaceChildren());
            document.body.append(viewer);
            indexCode = attachCodeSearch(viewer, viewer.querySelector('.expanded-code'));
        }
        viewer.querySelector('h2').textContent = language + ' · 代码';
        // Keep the original highlighted spans and line breaks. Strip duplicate fragment IDs.
        const pre = source.cloneNode(true);
        pre.removeAttribute('id');
        pre.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
        const pane = viewer.querySelector('.expanded-code');
        pane.replaceChildren(pre);
        indexCode();
        viewer.showModal();
        pane.scrollTop = pane.scrollLeft = 0;
        pane.focus();
    }

    for (const figure of article.querySelectorAll('.content figure.highlight')) {
        const code = figure.querySelector('.code pre');
        if (!code) continue;
        const toolbar = document.createElement('div');
        toolbar.className = 'code-tools';
        const lang = Array.from(figure.classList).find(name => !['highlight', 'hljs', 'foldable', 'folded'].includes(name));
        const label = document.createElement('span');
        label.textContent = (lang || 'text').toUpperCase();
        toolbar.append(label);
        if (typeof HTMLDialogElement !== 'undefined' && HTMLDialogElement.prototype.showModal) {
            const expand = document.createElement('button');
            expand.type = 'button';
            expand.textContent = '展开代码 ↗';
            expand.setAttribute('aria-haspopup', 'dialog');
            expand.addEventListener('click', () => showCode(code, label.textContent));
            toolbar.append(expand);
        }
        if (navigator.clipboard) {
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.textContent = '复制代码';
            copy.addEventListener('click', async () => {
                try {
                    const clone = code.cloneNode(true);
                    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
                    await navigator.clipboard.writeText(clone.textContent);
                    copy.textContent = '已复制';
                } catch (_) { copy.textContent = '请选中代码复制'; }
            });
            toolbar.append(copy);
        }
        figure.before(toolbar);
    }

    const outline = article.querySelector('.reading-outline');
    if (!outline) return;
    const resume = article.querySelector('.resume-section');
    const key = 'goko-section:' + location.pathname;
    const entries = Array.from(outline.querySelectorAll('[data-heading]'), link => ({
        link, heading: document.getElementById(link.dataset.heading)
    })).filter(item => item.heading);
    if (!entries.length) return;
    try {
        const saved = localStorage.getItem(key);
        const match = entries.find(item => item.heading.id === saved);
        if (match && !location.hash) {
            resume.href = match.link.href;
            resume.textContent = '接着读 · ' + match.link.textContent;
            resume.hidden = false;
            resume.addEventListener('click', () => { resume.hidden = true; });
        }
    } catch (_) {}

    const shallowest = Math.min(...entries.map(item => Number(item.heading.tagName.slice(1))));
    entries.forEach(item => {
        item.link.style.setProperty('--heading-depth', Math.min(3, Number(item.heading.tagName.slice(1)) - shallowest));
    });
    const holder = outline.parentElement;
    const sidebar = document.querySelector('.reader-outline-slot');
    const desktop = matchMedia('(min-width: 1024px)');
    function place() {
        if (desktop.matches && sidebar && !document.body.classList.contains('immersive-reading')) sidebar.prepend(outline);
        else holder.append(outline);
        outline.open = desktop.matches && !document.body.classList.contains('immersive-reading');
    }
    place();
    desktop.addEventListener('change', place);
    placeOutline = place;
    const dial = dock.querySelector('input[type=range]');
    const caption = dock.querySelector('.dial-caption');
    dial.max = entries.length;
    dial.disabled = entries.length === 1;
    dock.style.setProperty('--tick-distance', (100 / Math.max(1, entries.length - 1)) + '%');
    function indicate(number) {
        const text = number + ' / ' + entries.length + ' · ' + entries[number - 1].link.textContent;
        dial.value = number;
        dial.setAttribute('aria-valuetext', text);
        caption.textContent = text;
        dock.style.setProperty('--travel', ((number - 1) / Math.max(1, entries.length - 1) * 100) + '%');
    }
    let scrubbing = false;
    dial.addEventListener('input', () => { scrubbing = true; indicate(Number(dial.value)); });
    dial.addEventListener('change', () => {
        scrubbing = false;
        const entry = entries[Number(dial.value) - 1];
        history.replaceState(history.state, '', entry.link.hash);
        entry.heading.scrollIntoView({ block: 'start', behavior: 'instant' });
        save();
    });
    dial.addEventListener('blur', () => { scrubbing = false; locate(); });
    indicate(1);
    let active = null, timer;
    function locate() {
        if (scrubbing) return;
        const line = Math.max(145, Math.min(190, innerHeight * .25));
        let current = null;
        for (const entry of entries) {
            if (entry.heading.getBoundingClientRect().top > line) break;
            current = entry;
        }
        if (current === active) return;
        if (active) active.link.removeAttribute('aria-current');
        active = current;
        if (active) active.link.setAttribute('aria-current', 'location');
        const saveButton = dock.querySelector('[data-save-mark]');
        saveButton.dataset.anchor = active ? active.heading.id : '';
        saveButton.dataset.section = active ? active.link.textContent : '';
        saveButton.dispatchEvent(new Event('reader-position'));
        indicate(active ? entries.indexOf(active) + 1 : 1);
    }
    function save() {
        clearTimeout(timer);
        locate();
        if (!active) return;
        try { localStorage.setItem(key, active.heading.id); } catch (_) {}
    }
    dock.querySelector('[data-save-mark]').addEventListener('click', locate, { capture: true });
    window.addEventListener('hashchange', locate);
    window.addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(save, 100); }, { passive: true });
    window.addEventListener('pagehide', save);
    outline.addEventListener('click', event => {
        if (!desktop.matches && event.target.closest('a')) outline.open = false;
    });
    locate();
})();
