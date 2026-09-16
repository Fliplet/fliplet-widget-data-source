var WaitUntilSized = (function() {
  var DEFAULT_TIMEOUT = 2000;

  // Polls (via requestAnimationFrame) until the element at `selector` has a
  // non-zero width/height, then invokes `callback`. Falls open after
  // `timeout` ms so a failed sibling fetch (which skips the code path that
  // sizes the container) can't leave the caller waiting forever.
  //
  // The element is re-queried on every tick rather than resolved once up
  // front: if `selector` isn't in the DOM yet at call time, a one-time lookup
  // would find nothing and this would never poll or time out, so callback
  // would silently never fire. Re-querying means an element that appears
  // later is picked up, and the timeout still fires if it never appears.
  function waitUntilSized(selector, callback, timeout) {
    var deadline = Date.now() + (typeof timeout === 'number' ? timeout : DEFAULT_TIMEOUT);

    function check() {
      var el = document.querySelector(selector);

      // Only bail without a callback when the element existed and was then
      // removed - a selector that has never matched anything keeps polling
      // (and still falls open at the deadline) rather than going silent.
      if (el && !document.contains(el)) {
        return;
      }

      var sized = el && (function() {
        var rect = el.getBoundingClientRect();

        return rect.width > 0 && rect.height > 0;
      })();

      if (sized || Date.now() >= deadline) {
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
