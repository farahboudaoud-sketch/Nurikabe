
(function () {
  try {
    var A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!A) return;
    A.addListener('backButton', function () {
      var r = document.getElementById('rules');
      if (r.classList.contains('on')) { r.classList.remove('on'); return; }
      if (typeof hint !== 'undefined' && hint) { hint = null; showHintText(''); render(); return; }
      if (inGame) { backFromGame(); return; }
      A.minimizeApp();
    });
    A.addListener('pause', function () { try { save(); } catch (e) {} });
  } catch (e) {}
})();
