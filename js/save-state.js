/**
 * Telling a slow, hung or failed save apart, and what to say about it.
 *
 * The commit API takes no timeout, and a commit that never settles used to
 * leave the editor looking idle while the request was still running. A retry
 * then inserted the same rows again once every attempt landed (PS-2251). This
 * module races a commit against a soft and a hard timer and sorts its errors
 * into ones the server certainly did not apply and ones it may have applied.
 *
 * In its own module so the timing and the classification are executed by the
 * specs.
 */

// eslint-disable-next-line no-unused-vars
var SaveState = (function() {
  'use strict';

  var ACCESS_MESSAGE = 'Access denied. Please review your security settings if you want to access this data source.';
  var CONNECTION_MESSAGE = 'Couldn\'t connect to the server. Please check your connection and try again.';
  var SLOW_MESSAGE = 'Saving is taking longer than usual. Your changes are kept, please don\'t re-enter them.';
  var UNCONFIRMED_MESSAGE = 'We couldn\'t confirm your last save. The table has been refreshed from the server; check it and re-enter anything missing.';
  var RELOAD_FAILED_MESSAGE = 'Couldn\'t refresh the table after an unconfirmed save. Reload the data source before editing.';
  var LATE_SAVE_MESSAGE = 'Your earlier save has now completed. Reload the data source before saving again.';
  var SAVED_NOT_REFRESHED_MESSAGE = 'Saved. Couldn\'t refresh the table.';
  var DEFAULT_MESSAGE = 'Something went wrong. Please try again.';

  /**
   * Error message when no parser is given and Fliplet is not loaded (specs)
   * @param {*} error - Error to describe
   * @param {String} defaultMessage - Used when the error has no message
   * @returns {String} Message
   */
  function fallbackParseError(error, defaultMessage) {
    if (typeof error === 'string' && error) {
      return error;
    }

    return (error && error.message) || defaultMessage;
  }

  /**
   * Sort a fetch or commit error by whether the server may have applied it
   * @param {*} error - A jqXHR from Fliplet.API.request, an Error, or the
   *   rejection withTimeouts() makes at the hard ceiling
   * @param {Object} [options] - Settings, all optional
   * @param {Function} [options.parseError] - (error, defaultMessage) → String.
   *   Defaults to Fliplet.parseError in the browser.
   * @param {String} [options.defaultMessage] - Used when nothing better is found
   * @param {String} [options.operation] - 'commit' for a save. The commit
   *   endpoint answers 400 for failures after it has inserted rows, so a 400
   *   there does not mean nothing was written.
   * @returns {Object} { kind: 'definitive' | 'ambiguous', status, message,
   *   detail, timedOut, error }. 'definitive' means the server answered and
   *   did not apply the request. detail is the error's own message, when it
   *   has one worth showing.
   */
  function classifyError(error, options) {
    options = options || {};

    var parseError = options.parseError
      || (typeof Fliplet !== 'undefined' && Fliplet.parseError) // eslint-disable-line no-undef
      || fallbackParseError;
    var defaultMessage = options.defaultMessage || DEFAULT_MESSAGE;
    var status = readStatus(error);
    var result = {
      kind: 'ambiguous',
      status: status,
      message: undefined,
      detail: undefined,
      timedOut: false,
      error: error
    };

    if (error && error.timedOut) {
      result.timedOut = true;
      result.message = UNCONFIRMED_MESSAGE;

      return result;
    }

    if (status === 401 || status === 403) {
      result.kind = 'definitive';
      result.message = ACCESS_MESSAGE;

      return result;
    }

    if (status === 0) {
      result.message = CONNECTION_MESSAGE;
      result.detail = CONNECTION_MESSAGE;

      return result;
    }

    // Any other 4xx is the server refusing the request. A 408 is a timeout,
    // which says nothing about whether the work was done, and a commit 400
    // may follow rows already inserted.
    if (status >= 400 && status < 500 && status !== 408
      && !(status === 400 && options.operation === 'commit')) {
      result.kind = 'definitive';
    }

    var parsed = parseError(error, defaultMessage);

    if (typeof parsed === 'string' && parsed && parsed !== defaultMessage) {
      result.detail = parsed;
    }

    result.message = result.detail || defaultMessage;

    return result;
  }

  /**
   * HTTP status of a jqXHR. A numeric string is read as a number; anything
   * else is unknown.
   * @param {*} error - Error to read
   * @returns {Number|undefined} Status
   */
  function readStatus(error) {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    var status = typeof error.status === 'string' && error.status.trim() !== ''
      ? Number(error.status)
      : error.status;

    return typeof status === 'number' && !isNaN(status) ? status : undefined;
  }

  /**
   * Message for a save that may or may not have been applied, after the
   * table has been refreshed from the server
   * @param {Object} failure - Result of classifyError()
   * @returns {String} Message, led by the error's own message when it has one
   */
  function unconfirmedMessage(failure) {
    var detail = failure && !failure.timedOut && failure.detail;

    if (!detail) {
      return UNCONFIRMED_MESSAGE;
    }

    return detail.replace(/[\s.]*$/, '') + '. ' + UNCONFIRMED_MESSAGE;
  }

  /**
   * Whether a save may start. A save is in flight from the moment it starts
   * until it settles. A save that may have been applied, and could not be
   * followed by a refresh, needs a reload: saving again from a grid that
   * does not show what the server has would insert its new rows twice.
   * Only a reload that started after the last reason to reload clears it.
   * @returns {Object} The lock
   */
  function createSaveLock() {
    var inFlight = false;
    var needsReload = false;
    var reason = null;
    var epoch = 0;

    return {
      /**
       * @returns {String} 'inFlight', 'needsReload' or 'idle'
       */
      state: function() {
        if (inFlight) {
          return 'inFlight';
        }

        return needsReload ? 'needsReload' : 'idle';
      },
      isInFlight: function() {
        return inFlight;
      },
      needsReload: function() {
        return needsReload;
      },
      // Nothing may change the grid or save it
      isLocked: function() {
        return inFlight || needsReload;
      },
      reason: function() {
        return reason;
      },
      /**
       * Start a save
       * @returns {Boolean} False when a save is running or a reload is needed
       */
      start: function() {
        if (inFlight || needsReload) {
          return false;
        }

        inFlight = true;

        return true;
      },
      finish: function() {
        inFlight = false;
      },
      /**
       * Block saving until the grid has been reloaded from the server
       * @param {String} message - What to tell the user
       * @returns {undefined}
       */
      requireReload: function(message) {
        needsReload = true;
        reason = message;
        epoch++;
      },
      /**
       * Note a reload starting
       * @returns {Number} Token to hand to reloaded()
       */
      beginReload: function() {
        return epoch;
      },
      /**
       * A reload rebuilt the grid from the server
       * @param {Number} token - From beginReload() when the reload started
       * @returns {Boolean} True when this cleared the need to reload
       */
      reloaded: function(token) {
        if (!needsReload || token !== epoch) {
          return false;
        }

        needsReload = false;
        reason = null;

        return true;
      }
    };
  }

  /**
   * Settle with a promise's result, calling onSoft once if it runs past
   * softMs and rejecting if it runs past hardMs. A settle after the hard
   * ceiling is ignored.
   * @param {Promise} promise - Promise to watch
   * @param {Object} [options] - Settings, all optional
   * @param {Number} [options.softMs] - Defaults to SaveState.SOFT_TIMEOUT_MS
   * @param {Number} [options.hardMs] - Defaults to SaveState.HARD_TIMEOUT_MS
   * @param {Function} [options.onSoft] - Called once at softMs
   * @param {Function} [options.setTimeout] - Timer, for the specs
   * @param {Function} [options.clearTimeout] - Timer, for the specs
   * @returns {Promise} Settles like the promise, or rejects with
   *   { kind: 'ambiguous', timedOut: true } at hardMs
   */
  function withTimeouts(promise, options) {
    options = options || {};

    var softMs = typeof options.softMs === 'number' ? options.softMs : api.SOFT_TIMEOUT_MS;
    var hardMs = typeof options.hardMs === 'number' ? options.hardMs : api.HARD_TIMEOUT_MS;
    var setTimer = options.setTimeout || function(fn, ms) {
      return setTimeout(fn, ms);
    };
    var clearTimer = options.clearTimeout || function(timer) {
      clearTimeout(timer);
    };

    return new Promise(function(resolve, reject) {
      var settled = false;
      var softTimer = null;
      var hardTimer = null;

      function finish(settle, value) {
        if (settled) {
          return;
        }

        settled = true;

        if (softTimer !== null) {
          clearTimer(softTimer);
        }

        if (hardTimer !== null) {
          clearTimer(hardTimer);
        }

        settle(value);
      }

      if (typeof options.onSoft === 'function') {
        softTimer = setTimer(function() {
          softTimer = null;

          if (!settled) {
            options.onSoft();
          }
        }, softMs);
      }

      hardTimer = setTimer(function() {
        hardTimer = null;

        finish(reject, {
          kind: 'ambiguous',
          timedOut: true,
          message: UNCONFIRMED_MESSAGE
        });
      }, hardMs);

      Promise.resolve(promise).then(function(value) {
        finish(resolve, value);
      }, function(error) {
        finish(reject, error);
      });
    });
  }

  var api = {
    // Read at call time, so the E2E harness can shorten them
    SOFT_TIMEOUT_MS: 30000,
    HARD_TIMEOUT_MS: 120000,
    ACCESS_MESSAGE: ACCESS_MESSAGE,
    CONNECTION_MESSAGE: CONNECTION_MESSAGE,
    SLOW_MESSAGE: SLOW_MESSAGE,
    UNCONFIRMED_MESSAGE: UNCONFIRMED_MESSAGE,
    RELOAD_FAILED_MESSAGE: RELOAD_FAILED_MESSAGE,
    LATE_SAVE_MESSAGE: LATE_SAVE_MESSAGE,
    SAVED_NOT_REFRESHED_MESSAGE: SAVED_NOT_REFRESHED_MESSAGE,
    classifyError: classifyError,
    unconfirmedMessage: unconfirmedMessage,
    createSaveLock: createSaveLock,
    withTimeouts: withTimeouts
  };

  return api;
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SaveState;
}
