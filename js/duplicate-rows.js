/**
 * Spotting new rows that are exact copies of other rows in the same save.
 *
 * A fill-handle drag or a paste into the spare rows produces rows without an
 * id whose data matches rows already in the grid. Saving them inserts silent
 * duplicates. This module finds them so the save can ask before committing.
 *
 * In its own module so the matching is executed by the specs.
 */

// eslint-disable-next-line no-unused-vars
var DuplicateRows = (function() {
  'use strict';

  // The entry-diff module is a global in the browser bundle and a CommonJS
  // module in the specs
  var entryDiff = typeof EntryDiff !== 'undefined'
    ? EntryDiff // eslint-disable-line no-undef
    : require('./entry-diff');

  // Grid row of the first data row (row 1 is the column headers)
  var FIRST_DATA_ROW = 2;

  /**
   * Serialise a value with object keys sorted, so key order does not matter
   * @param {*} value - Value to serialise
   * @returns {String} Stable string representation
   */
  function stableStringify(value) {
    if (Array.isArray(value)) {
      return '[' + value.map(stableStringify).join(',') + ']';
    }

    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(function(key) {
        return JSON.stringify(key) + ':' + stableStringify(value[key]);
      }).join(',') + '}';
    }

    var serialized = JSON.stringify(value);

    return typeof serialized === 'undefined' ? 'null' : serialized;
  }

  /**
   * Find new rows whose data exactly matches another row in the same save
   * @param {Array} entries - Entries in visual order ([{ id, data }])
   * @returns {Object} { count, rows } where rows are 1-based grid row numbers
   */
  function find(entries) {
    var counts = {};
    var keys = [];
    var rows = [];

    (entries || []).forEach(function(entry, index) {
      var normalized = entryDiff.normalizeData(entry && entry.data);
      var key = Object.keys(normalized).length ? stableStringify(normalized) : null;

      keys[index] = key;

      if (key !== null) {
        counts[key] = (counts[key] || 0) + 1;
      }
    });

    (entries || []).forEach(function(entry, index) {
      var key = keys[index];

      if (key === null || (entry && entry.id) || counts[key] < 2) {
        return;
      }

      rows.push(index + FIRST_DATA_ROW);
    });

    return {
      count: rows.length,
      rows: rows
    };
  }

  return {
    find: find
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DuplicateRows;
}
