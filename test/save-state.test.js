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
  [400, 404, 409, 422].forEach(function(status) {
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

  it('never returns "[object Object]" for an object without a message', function() {
    var result = SaveState.classifyError({ status: 500 }, {
      parseError: function() {
        return { not: 'a string' };
      },
      defaultMessage: 'Error loading data source.'
    });

    expect(result.message).toBe('Error loading data source.');
  });

  it('uses the default message when the parser returns an empty string', function() {
    var result = SaveState.classifyError(xhr(500, 'ignored'), {
      parseError: function() {
        return '';
      },
      defaultMessage: 'Error saving data source.'
    });

    expect(result.message).toBe('Error saving data source.');
    expect(result.detail).toBeUndefined();
  });

  it('reads a numeric string status as a number', function() {
    var result = classify({ status: '500', responseJSON: { message: 'Down' } });

    expect(result.status).toBe(500);
    expect(result.kind).toBe('ambiguous');
    expect(classify({ status: '422' }).kind).toBe('definitive');
  });

  it('treats an empty-string status as unknown and ambiguous, not as 0', function() {
    var result = classify({ status: '' });

    expect(result.status).toBeUndefined();
    expect(result.kind).toBe('ambiguous');
    expect(result.message).toBe('Error saving data source.');
  });

  it('treats a non-numeric status as unknown and ambiguous', function() {
    var result = classify({ status: 'error' });

    expect(result.status).toBeUndefined();
    expect(result.kind).toBe('ambiguous');
  });

  it('works without an injected parser outside the browser', function() {
    expect(SaveState.classifyError(new Error('Nope')).message).toBe('Nope');
    expect(SaveState.classifyError('Plain text').message).toBe('Plain text');
  });
});

describe('SaveState.classifyError for a commit', function() {
  function classifyCommit(error) {
    return SaveState.classifyError(error, {
      parseError: parseError,
      defaultMessage: 'Error saving data source.',
      operation: 'commit'
    });
  }

  it('treats 400 as ambiguous, keeping the server message', function() {
    var result = classifyCommit(xhr(400, 'Hook failed'));

    expect(result.kind).toBe('ambiguous');
    expect(result.status).toBe(400);
    expect(result.detail).toBe('Hook failed');
  });

  [401, 403, 404, 409, 413, 422, 429].forEach(function(status) {
    it('keeps ' + status + ' definitive', function() {
      expect(classifyCommit(xhr(status, 'No')).kind).toBe('definitive');
    });
  });

  [0, 408, 500, 504].forEach(function(status) {
    it('keeps ' + status + ' ambiguous', function() {
      expect(classifyCommit(xhr(status)).kind).toBe('ambiguous');
    });
  });

  it('leaves a fetch 400 definitive', function() {
    expect(classify(xhr(400, 'Bad query')).kind).toBe('definitive');
  });
});

describe('SaveState.unconfirmedMessage', function() {
  it('leads with the server message', function() {
    var failure = SaveState.classifyError(xhr(400, 'Hook failed.'), {
      parseError: parseError,
      operation: 'commit'
    });

    expect(SaveState.unconfirmedMessage(failure)).toBe('Hook failed. ' + SaveState.UNCONFIRMED_MESSAGE);
  });

  it('is the plain message when there is no server message', function() {
    expect(SaveState.unconfirmedMessage(classify(xhr(504)))).toBe(SaveState.UNCONFIRMED_MESSAGE);
  });

  it('is the plain message for status 0, which has no server message', function() {
    expect(SaveState.unconfirmedMessage(classify(xhr(0)))).toBe(SaveState.UNCONFIRMED_MESSAGE);
  });

  it('warns the save may still land, then asks the user to copy, reload and re-check', function() {
    expect(SaveState.UNCONFIRMED_MESSAGE).toBe('We couldn\'t confirm whether your last save was applied. It may still complete in the next few minutes. Copy anything you need, then Reload to see what was saved; check again before re-entering rows.');
  });
});

describe('SaveState.createSaveLock', function() {
  it('starts idle and lets one save start at a time', function() {
    var lock = SaveState.createSaveLock();

    expect(lock.state()).toBe('idle');
    expect(lock.isLocked()).toBe(false);
    expect(lock.start()).toBe(true);
    expect(lock.state()).toBe('inFlight');
    expect(lock.isLocked()).toBe(true);
    expect(lock.start()).toBe(false);

    lock.finish();

    expect(lock.state()).toBe('idle');
    expect(lock.start()).toBe(true);
  });

  it('blocks saving until a reload started after the reason succeeds', function() {
    var lock = SaveState.createSaveLock();
    var before = lock.beginReload();

    lock.requireReload('Reload please');

    expect(lock.state()).toBe('needsReload');
    expect(lock.reason()).toBe('Reload please');
    expect(lock.start()).toBe(false);

    // A reload that was already running shows data from before the reason
    expect(lock.reloaded(before)).toBe(false);
    expect(lock.needsReload()).toBe(true);

    expect(lock.reloaded(lock.beginReload())).toBe(true);
    expect(lock.state()).toBe('idle');
    expect(lock.reason()).toBe(null);
    expect(lock.start()).toBe(true);
  });

  it('keeps a reload need raised during a save once the save finishes', function() {
    var lock = SaveState.createSaveLock();

    lock.start();

    var reload = lock.beginReload();

    lock.requireReload('Saved. Couldn\'t refresh the table.');
    lock.finish();

    expect(lock.state()).toBe('needsReload');
    expect(lock.reloaded(reload)).toBe(false);
    expect(lock.isLocked()).toBe(true);
  });

  it('ignores a reload when none is needed', function() {
    var lock = SaveState.createSaveLock();

    expect(lock.reloaded(lock.beginReload())).toBe(false);
    expect(lock.state()).toBe('idle');
  });
});

describe('SaveState.withTimeouts', function() {
  it('exposes writable timeout constants', function() {
    var soft = SaveState.SOFT_TIMEOUT_MS;
    var reload = SaveState.RELOAD_TIMEOUT_MS;

    expect(soft).toBe(30000);
    expect(reload).toBe(60000);
    expect(SaveState.HARD_TIMEOUT_MS).toBeUndefined();

    SaveState.SOFT_TIMEOUT_MS = 5;
    SaveState.RELOAD_TIMEOUT_MS = 7;
    expect(SaveState.SOFT_TIMEOUT_MS).toBe(5);
    expect(SaveState.RELOAD_TIMEOUT_MS).toBe(7);

    SaveState.SOFT_TIMEOUT_MS = soft;
    SaveState.RELOAD_TIMEOUT_MS = reload;
  });

  it('has no ceiling without hardMs: waits for the commit however long it takes', async function() {
    var timers = fakeTimers();
    var softCalls = 0;
    var commit = deferred();
    var state = watch(SaveState.withTimeouts(commit.promise, {
      softMs: 100,
      onSoft: function() {
        softCalls++;
      },
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    }));

    timers.tick(100);
    timers.tick(10 * 60 * 1000);
    await flush();

    expect(softCalls).toBe(1);
    expect(state.settled).toBe(0);
    expect(timers.pending()).toBe(0);

    commit.resolve('saved');
    await flush();

    expect(state.value).toBe('saved');
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

  it('reads the default soft timeout at call time', async function() {
    var soft = SaveState.SOFT_TIMEOUT_MS;
    var softCalls = 0;

    SaveState.SOFT_TIMEOUT_MS = 5;

    try {
      var value = await SaveState.withTimeouts(new Promise(function(resolve) {
        setTimeout(function() {
          resolve('saved');
        }, 30);
      }), {
        onSoft: function() {
          softCalls++;
        }
      });

      expect(softCalls).toBe(1);
      expect(value).toBe('saved');
    } finally {
      SaveState.SOFT_TIMEOUT_MS = soft;
    }
  });
});
