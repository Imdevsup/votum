// Content-script bootstrap. Each module above this in the manifest's
// content_scripts list has already attached its surface to
// `window.__VOTUM__`. All this file does is start the lifecycle once
// every dependency is in place.
(function () {
  'use strict';
  if (!window.VOTUM_CONFIG) return;
  if (!window.__VOTUM__?.lifecycle?.start) return;
  window.__VOTUM__.lifecycle.start();
})();
