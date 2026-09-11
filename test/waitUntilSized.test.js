/* eslint-env jest */
var WaitUntilSized = require('../js/waitUntilSized');

describe('WaitUntilSized.waitUntilSized', function() {
  var rafCallbacks;
  var originalDocument;
  var originalRAF;

  beforeEach(function() {
    rafCallbacks = [];
    originalDocument = global.document;
    originalRAF = global.requestAnimationFrame;

    global.requestAnimationFrame = function(cb) {
      rafCallbacks.push(cb);

      return rafCallbacks.length;
    };
  });

  afterEach(function() {
    global.document = originalDocument;
    global.requestAnimationFrame = originalRAF;
    jest.restoreAllMocks();
  });

  function flushRAF() {
    var pending = rafCallbacks;

    rafCallbacks = [];
    pending.forEach(function(cb) {
      cb();
    });
  }

  function makeDocument(el) {
    return {
      querySelector: function() {
        return el;
      },
      contains: function(node) {
        return node === el;
      }
    };
  }

  it('invokes the callback immediately when the element is already sized', function() {
    var callback = jest.fn();
    var el = { getBoundingClientRect: function() { return { width: 100, height: 50 }; } };

    global.document = makeDocument(el);

    WaitUntilSized.waitUntilSized('.table-entries', callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(rafCallbacks.length).toBe(0);
  });

  it('polls via requestAnimationFrame until the element becomes sized', function() {
    var callback = jest.fn();
    var width = 0;
    var el = { getBoundingClientRect: function() { return { width: width, height: width }; } };

    global.document = makeDocument(el);

    WaitUntilSized.waitUntilSized('.table-entries', callback);

    expect(callback).not.toHaveBeenCalled();
    expect(rafCallbacks.length).toBe(1);

    flushRAF();
    expect(callback).not.toHaveBeenCalled();

    width = 200;
    flushRAF();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('stops polling and returns without calling back if the element is removed from the DOM', function() {
    var callback = jest.fn();
    var el = { getBoundingClientRect: function() { return { width: 0, height: 0 }; } };
    var doc = makeDocument(el);

    global.document = doc;

    WaitUntilSized.waitUntilSized('.table-entries', callback);
    expect(rafCallbacks.length).toBe(1);

    // Simulate the container being torn down (e.g. DSM closed) before it was ever sized
    doc.contains = function() {
      return false;
    };

    flushRAF();

    expect(callback).not.toHaveBeenCalled();
    expect(rafCallbacks.length).toBe(0);
  });

  it('falls open and calls back once the timeout elapses, even if never sized', function() {
    var callback = jest.fn();
    var el = { getBoundingClientRect: function() { return { width: 0, height: 0 }; } };
    var now = 1000;

    global.document = makeDocument(el);
    jest.spyOn(Date, 'now').mockImplementation(function() {
      return now;
    });

    WaitUntilSized.waitUntilSized('.table-entries', callback, 50);

    expect(callback).not.toHaveBeenCalled();

    now += 60;
    flushRAF();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
