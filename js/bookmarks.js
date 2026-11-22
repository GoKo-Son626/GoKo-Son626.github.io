// One localStorage entry per saved passage keeps changes in separate tabs independent.
(() => {
    'use strict';
    const shelf = document.querySelector('.bookmark-shelf');
    if (!shelf || typeof shelf.showModal !== 'function') return;
    const prefix = 'goko:bookmark:1:';
    const openers = document.querySelectorAll('[data-open-marks]');
    const saveButton = document.querySelector('[data-save-mark]');
    const feedback = document.querySelector('.bookmark-feedback');
    const counts = document.querySelectorAll('[data-mark-total]');
    const counter = shelf.querySelector('[data-mark-count]');
    const controls = shelf.querySelector('.bookmark-controls');
    const query = shelf.querySelector('[data-mark-query]');
    const stack = shelf.querySelector('[data-mark-stack]');
    const results = shelf.querySelector('.bookmark-results');
    const undo = shelf.querySelector('[data-mark-undo]');
    const entries = new Map();
    let storageAvailable = true, lastRemoved = null;

    function keyFor(path, anchor) { return prefix + path + '#' + encodeURIComponent(anchor); }
    function currentKey() { return keyFor(location.pathname, saveButton.dataset.anchor || ''); }

    function read() {
        entries.clear();
        try {
            for (const key of Object.keys(localStorage)) {
                if (!key.startsWith(prefix)) continue;
                const raw = localStorage.getItem(key);
                try {
                    const mark = JSON.parse(raw);
                    if (!mark || typeof mark.path !== 'string' || !mark.path.startsWith('/') ||
                        typeof mark.anchor !== 'string' || typeof mark.title !== 'string' ||
                        typeof mark.section !== 'string' || typeof mark.stack !== 'string' ||
                        typeof mark.collection !== 'string' || !Number.isFinite(mark.time)) continue;
                    const url = new URL(mark.path, location.origin);
                    if (url.origin === location.origin && url.pathname === mark.path && key === keyFor(mark.path, mark.anchor))
                        entries.set(key, mark);
                } catch (_) { continue; }
            }
            storageAvailable = true;
        } catch (_) { storageAvailable = false; }
    }

    function updateSaveButton() {
        if (!saveButton) return;
        const saved = entries.has(currentKey());
        const name = saveButton.dataset.anchor ? '本节' : '本文';
        saveButton.setAttribute('aria-pressed', String(saved));
        saveButton.textContent = saved ? '已收藏' + name : '收藏' + name;
        saveButton.title = (saved ? '移除书签 · ' : '保存书签 · ') +
            (saveButton.dataset.section || document.getElementById('reader-title').textContent);
    }

    function refreshControls() {
        for (const count of counts) count.textContent = entries.size ? ' · ' + entries.size : '';
        updateSaveButton();
        if (!shelf.open) return;
        const selected = stack.value;
        stack.replaceChildren(new Option('全部方向', ''));
        const names = new Map(Array.from(entries.values(), mark => [mark.stack, mark.collection]));
        for (const [id, name] of names) stack.add(new Option(name, id));
        stack.value = names.has(selected) ? selected : '';
        controls.hidden = !entries.size;
        undo.hidden = !lastRemoved;
        render();
    }

    function textNode(tag, text, className) {
        const element = document.createElement(tag);
        element.textContent = text;
        if (className) element.className = className;
        return element;
    }
    function render() {
        const words = query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        const groups = new Map();
        let matches = 0;
        for (const mark of [...entries.values()].sort((a, b) => b.time - a.time)) {
            if (stack.value && mark.stack !== stack.value) continue;
            const text = [mark.title, mark.section, mark.collection].join(' ').toLocaleLowerCase();
            if (!words.every(word => text.includes(word))) continue;
            if (!groups.has(mark.path)) groups.set(mark.path, []);
            groups.get(mark.path).push(mark);
            matches++;
        }
        counter.textContent = storageAvailable ? matches + ' 处书签 · ' + groups.size + ' 篇文章' : '当前浏览器无法读取书签';
        results.replaceChildren();
        if (!groups.size) {
            results.append(textNode('h3', entries.size ? '没有匹配的书签' : '还没有书签'),
                textNode('p', entries.size ? '试试其他关键词或技术方向。' : '阅读文章时点「收藏本节」，下次就能直接回到那一段。'));
            return;
        }
        const fragment = document.createDocumentFragment();
        for (const marks of groups.values()) {
            const first = marks[0];
            const group = document.createElement('section');
            group.className = 'bookmark-group';
            group.dataset.stack = first.stack;
            const heading = document.createElement('h3');
            const article = textNode('a', first.title);
            article.href = first.path;
            heading.append(article);
            group.append(textNode('p', first.collection, 'bookmark-category'), heading);
            const list = document.createElement('ul');
            for (const mark of marks) {
                const item = document.createElement('li');
                const link = textNode('a', mark.section || '文章开头');
                link.href = mark.path + (mark.anchor ? '#' + encodeURIComponent(mark.anchor) : '');
                const remove = textNode('button', '移除');
                remove.type = 'button';
                remove.dataset.removeMark = keyFor(mark.path, mark.anchor);
                remove.setAttribute('aria-label', '移除书签 · ' + (mark.section || mark.title));
                item.append(link, remove);
                list.append(item);
            }
            group.append(list);
            fragment.append(group);
        }
        results.append(fragment);
    }

    function write(key, mark) {
        try {
            if (mark) localStorage.setItem(key, JSON.stringify(mark));
            else localStorage.removeItem(key);
        } catch (_) {
            const message = '无法保存更改，请检查浏览器的本站存储设置。';
            if (shelf.open) counter.textContent = message;
            else if (feedback) feedback.textContent = message;
            return false;
        }
        read();
        refreshControls();
        return true;
    }
    if (saveButton) {
        saveButton.hidden = false;
        saveButton.addEventListener('reader-position', updateSaveButton);
        saveButton.addEventListener('click', () => {
            read();
            if (feedback) feedback.textContent = '';
            const key = currentKey();
            if (entries.has(key)) { write(key, null); return; }
            write(key, {
                path: location.pathname, anchor: saveButton.dataset.anchor || '',
                title: document.getElementById('reader-title').textContent,
                section: saveButton.dataset.section || '', stack: document.body.dataset.readerStack,
                collection: document.querySelector('.reader-collection').textContent, time: Date.now()
            });
        });
    }
    function open() {
        read();
        query.value = stack.value = '';
        shelf.showModal();
        refreshControls();
        if (entries.size) query.focus({ preventScroll: true });
    }
    for (const opener of openers) {
        opener.hidden = false;
        opener.addEventListener('click', open);
    }
    query.addEventListener('input', render);
    stack.addEventListener('change', render);
    results.addEventListener('click', event => {
        const button = event.target.closest('[data-remove-mark]');
        if (!button) {
            if (event.target.closest('a') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) shelf.close();
            return;
        }
        const buttons = [...results.querySelectorAll('[data-remove-mark]')];
        const index = buttons.indexOf(button);
        const key = button.dataset.removeMark;
        const mark = entries.get(key);
        if (!mark || !write(key, null)) return;
        lastRemoved = mark;
        undo.hidden = false;
        const remaining = results.querySelectorAll('[data-remove-mark]');
        (remaining[Math.min(index, remaining.length - 1)] || undo).focus();
    });
    undo.addEventListener('click', () => {
        if (!lastRemoved) return;
        const key = keyFor(lastRemoved.path, lastRemoved.anchor);
        read();
        if (!entries.has(key) && !write(key, lastRemoved)) return;
        lastRemoved = null;
        refreshControls();
        query.focus();
    });
    shelf.addEventListener('click', event => {
        if (event.target !== shelf) return;
        const r = shelf.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) shelf.close();
    });
    shelf.addEventListener('close', () => {
        lastRemoved = null;
        const url = new URL(location.href);
        if (url.searchParams.has('bookmarks')) {
            url.searchParams.delete('bookmarks');
            history.replaceState(history.state, '', url);
        }
    });
    const sync = () => { read(); refreshControls(); };
    window.addEventListener('storage', event => { if (!event.key || event.key.startsWith(prefix)) sync(); });
    window.addEventListener('pageshow', event => { if (event.persisted) sync(); });
    sync();
    if (new URLSearchParams(location.search).get('bookmarks') === '1') open();
})();
