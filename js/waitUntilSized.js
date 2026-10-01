var WaitUntilSized = (function() {
  var DEFAULT_TIMEOUT = 2000;

  // Polls (via requestAnimationFrame) until the element at `selector` has a
  // non-zero width/height, then invokes `callback`. Falls open after
  // `timeout` ms so a failed sibling fetch (which skips the code path that
  // sizes the container) can't leave the caller waiting forever.
  //
  // An element that is not in the page yet is looked up again on each frame,
  // and the same deadline applies: the grid must not stay blank with no error
  // because its container was not there at the first look. An element that was
  // found and then removed (the manager was closed) stops the wait without a
  // callback - there is nothing left to render into.
  function waitUntilSized(selector, callback, timeout) {
    var el = document.querySelector(selector);
    var deadline = Date.now() + (typeof timeout === 'number' ? timeout : DEFAULT_TIMEOUT);

    function check() {
      if (!el) {
        el = document.querySelector(selector);

        if (!el) {
          if (Date.now() >= deadline) {
            callback();
          } else {
            requestAnimationFrame(check);
          }

          return;
        }
      }

      if (!document.contains(el)) {
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
