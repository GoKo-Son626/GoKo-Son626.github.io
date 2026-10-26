/* Two CSS clouds only: no frame loop, pointer listener, canvas or particle state. */
(function () {
    'use strict';

    var body = document.body;
    if (!body || !body.classList.contains('celestial-reader')) return;

    function syncVisibility() {
        body.classList.toggle('reader-sky-paused', document.hidden);
    }

    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('pagehide', function () {
        body.classList.add('reader-sky-paused');
    });
    window.addEventListener('pageshow', syncVisibility);
}());
