var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var SaveState = require('../js/save-state');

/**
 * Parser standing in for Fliplet.parseError: reads the message off a jqXHR's
 * responseJSON, like the real one does
 * @param {*} error - Error to describe
 * @param {String} defaultMessage - Used when there is nothing to read
 * @returns {String} Message
 */
function parseError(error, defaultMessage) {
  if (error && error.responseJSON && error.responseJSON.message) {
    return error.responseJSON.message;
  }

  return (error && error.message) || defaultMessage;
}

function xhr(status, message) {
  return {
    status: status,
    responseJSON: message ? { message: message } : undefined,
    responseText: message ? JSON.stringify({ message: message }) : ''
  };
}

function classify(error) {
  return SaveState.classifyError(error, {
    parseError: parseError,
    defaultMessage: 'Error saving data source.'
  });
}

/**
 * Timers that only move when the spec says so
 * @returns {Object} { setTimeout, clearTimeout, tick(ms) }
 */
function fakeTimers() {
  var now = 0;
  var nextId = 1;
  var timers = {};

  return {
    setTimeout: function(fn, ms) {
      var id = nextId++;

      timers[id] = { fn: fn, at: now + ms };

      return id;
    },
    clearTimeout: function(id) {
      delete timers[id];
    },
    tick: function(ms) {
      now += ms;

      Object.keys(timers).map(Number).sort(function(a, b) {
        return timers[a].at - timers[b].at;
      }).forEach(function(id) {
        var timer = timers[id];

        if (timer && timer.at <= now) {
          delete timers[id];
          timer.fn();
        }
      });
    },
    pending: function() {
      return Object.keys(timers).length;
    }
  };
}

// Let promise callbacks run
function flush() {
  return new Promise(function(resolve) {
    setImmediate(resolve);
  });
}

function deferred() {
  var d = {};

  d.promise = new Promise(function(resolve, reject) {
    d.resolve = resolve;
    d.reject = reject;
  });

  return d;
}

/**
 * Watch a promise's outcome without letting a rejection go unhandled
 * @param {Promise} promise - Promise to watch
 * @returns {Object} { settled, value, error }
 */
function watch(promise) {
  var state = { settled: 0 };

  promise.then(function(value) {
    state.settled++;
    state.value = value;
  }, function(error) {
    state.settled++;
    state.error = error;
  });

  return state;
}

describe('SaveState.classifyError', function() {
  [400, 404, 422].forEach(function(status) {
    it('treats ' + status + ' as definitive, with the server message', function() {
      var result = classify(xhr(status, 'Column "x" is invalid'));

      expect(result.kind).toBe('definitive');
      expect(result.status).toBe(status);
      expect(result.message).toBe('Column "x" is invalid');
    });
  });

  [0, 408, 500, 502, 503, 504].forEach(function(status) {
    it('treats ' + status + ' as ambiguous', function() {
      var result = classify(xhr(status));

      expect(result.kind).toBe('ambiguous');
      expect(result.status).toBe(status);
      expect(typeof result.message).toBe('string');
    });
  });

  it('gives a connection message for status 0', function() {
    expect(classify(xhr(0)).message).toBe(SaveState.CONNECTION_MESSAGE);
  });

  it('keeps the server message for a 5xx', function() {
    expect(classify(xhr(500, 'Database unavailable')).message).toBe('Database unavailable');
  });

  it('falls back to the default message when a 5xx has none', function() {
    expect(classify(xhr(504)).message).toBe('Error saving data source.');
  });

  [401, 403].forEach(function(status) {
    it('treats ' + status + ' as definitive with the access message', function() {
      var result = classify(xhr(status, 'Forbidden'));

      expect(result.kind).toBe('definitive');
      expect(result.message).toBe(SaveState.ACCESS_MESSAGE);
    });
  });

  it('treats a non-jqXHR Error as ambiguous with a parsed message', function() {
    var error = new Error('Something broke');
    var result = classify(error);

    expect(result.kind).toBe('ambiguous');
    expect(result.status).toBeUndefined();
    expect(result.message).toBe('Something broke');
    expect(result.error).toBe(error);
  });

  it('treats a hard-ceiling rejection as ambiguous and unconfirmed', function() {
    var result = classify({ kind: 'ambiguous', timedOut: true });

    expect(result.kind).toBe('ambiguous');
    expect(result.timedOut).toBe(true);
    expect(result.message).toBe(SaveState.UNCONFIRMED_MESSAGE);
  });

  it('never returns "[object Object]" for an object without a message', function() {
    var result = SaveState.classifyError({ status: 500 }, {
      parseError: function() {
        return { not: 'a string' };
      },
      defaultMessage: 'Error loading data source.'
    });

    expect(result.message).toBe('Error loading data source.');
  });

  it('works without an injected parser outside the browser', function() {
    expect(SaveState.classifyError(new Error('Nope')).message).toBe('Nope');
    expect(SaveState.classifyError('Plain text').message).toBe('Plain text');
  });
});

describe('SaveState.withTimeouts', function() {
  it('exposes writable timeout constants', function() {
    var soft = SaveState.SOFT_TIMEOUT_MS;
    var hard = SaveState.HARD_TIMEOUT_MS;

    expect(soft).toBe(30000);
    expect(hard).toBe(120000);

    SaveState.SOFT_TIMEOUT_MS = 5;
    expect(SaveState.SOFT_TIMEOUT_MS).toBe(5);

    SaveState.SOFT_TIMEOUT_MS = soft;
    SaveState.HARD_TIMEOUT_MS = hard;
  });

  it('resolves before the soft timeout without calling onSoft', async function() {
    var timers = fakeTimers();
    var softCalls = 0;
    var commit = deferred();
    var state = watch(SaveState.withTimeouts(commit.promise, {
      softMs: 100,
      hardMs: 1000,
      onSoft: function() {
        softCalls++;
      },
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    }));

    timers.tick(50);
    commit.resolve({ clientIds: [] });
    await flush();

    expect(state.value).toEqual({ clientIds: [] });
    expect(timers.pending()).toBe(0);

    timers.tick(2000);
    await flush();

    expect(softCalls).toBe(0);
    expect(state.settled).toBe(1);
  });

  it('calls onSoft once and returns the result when it resolves between soft and hard', async function() {
    var timers = fakeTimers();
    var softCalls = 0;
    var commit = deferred();
    var state = watch(SaveState.withTimeouts(commit.promise, {
      softMs: 100,
      hardMs: 1000,
      onSoft: function() {
        softCalls++;
      },
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    }));

    timers.tick(100);
    timers.tick(300);
    await flush();

    expect(softCalls).toBe(1);
    expect(state.settled).toBe(0);

    commit.resolve('saved');
    await flush();

    expect(state.value).toBe('saved');

    timers.tick(2000);
    await flush();

    expect(softCalls).toBe(1);
    expect(state.settled).toBe(1);
  });

  it('passes a rejection through unchanged', async function() {
    var timers = fakeTimers();
    var commit = deferred();
    var error = xhr(400, 'Bad request');
    var state = watch(SaveState.withTimeouts(commit.promise, {
      softMs: 100,
      hardMs: 1000,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    }));

    commit.reject(error);
    await flush();

    expect(state.error).toBe(error);
    expect(timers.pending()).toBe(0);
  });

  it('rejects with timedOut after the hard timeout', async function() {
    var timers = fakeTimers();
    var softCalls = 0;
    var commit = deferred();
    var state = watch(SaveState.withTimeouts(commit.promise, {
      softMs: 100,
      hardMs: 1000,
      onSoft: function() {
        softCalls++;
      },
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    }));

    timers.tick(999);
    await flush();

    expect(state.settled).toBe(0);

    timers.tick(1);
    await flush();

    expect(softCalls).toBe(1);
    expect(state.settled).toBe(1);
    expect(state.error.kind).toBe('ambiguous');
    expect(state.error.timedOut).toBe(true);
    expect(SaveState.classifyError(state.error).timedOut).toBe(true);
  });

  it('ignores a settle after the hard ceiling', async function() {
    var timers = fakeTimers();
    var softCalls = 0;
    var resolved = deferred();
    var rejected = deferred();
    var options = {
      softMs: 100,
      hardMs: 1000,
      onSoft: function() {
        softCalls++;
      },
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    };
    var lateSuccess = watch(SaveState.withTimeouts(resolved.promise, options));
    var lateFailure = watch(SaveState.withTimeouts(rejected.promise, options));

    timers.tick(1000);
    await flush();

    resolved.resolve('late');
    rejected.reject(xhr(500));
    await flush();
    timers.tick(5000);
    await flush();

    expect(lateSuccess.settled).toBe(1);
    expect(lateSuccess.value).toBeUndefined();
    expect(lateSuccess.error.timedOut).toBe(true);
    expect(lateFailure.settled).toBe(1);
    expect(lateFailure.error.timedOut).toBe(true);
    expect(softCalls).toBe(2);
  });

  it('reads the default timeouts at call time', async function() {
    var soft = SaveState.SOFT_TIMEOUT_MS;
    var hard = SaveState.HARD_TIMEOUT_MS;
    var softCalls = 0;

    SaveState.SOFT_TIMEOUT_MS = 5;
    SaveState.HARD_TIMEOUT_MS = 20;

    try {
      var error = await SaveState.withTimeouts(new Promise(function() {}), {
        onSoft: function() {
          softCalls++;
        }
      }).then(function() {
        return null;
      }, function(err) {
        return err;
      });

      expect(softCalls).toBe(1);
      expect(error.timedOut).toBe(true);
    } finally {
      SaveState.SOFT_TIMEOUT_MS = soft;
      SaveState.HARD_TIMEOUT_MS = hard;
    }
  });
});
