var WaitUntilSized = (function() {
  var DEFAULT_TIMEOUT = 2000;

  // Polls (via requestAnimationFrame) until the element at `selector` has a
  // non-zero width/height, then invokes `callback`. Falls open after
  // `timeout` ms so a failed sibling fetch (which skips the code path that
  // sizes the container) can't leave the caller waiting forever.
  function waitUntilSized(selector, callback, timeout) {
    var el = document.querySelector(selector);
    var deadline = Date.now() + (typeof timeout === 'number' ? timeout : DEFAULT_TIMEOUT);

    function check() {
      if (!el || !document.contains(el)) {
        return;
      }

      var rect = el.getBoundingClientRect();

      if ((rect.width > 0 && rect.height > 0) || Date.now() >= deadline) {
        callback();
      } else {
        requestAnimationFrame(check);
      }
    }

    check();
  }

  return {
    waitUntilSized: waitUntilSized,
    DEFAULT_TIMEOUT: DEFAULT_TIMEOUT
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WaitUntilSized;
}
