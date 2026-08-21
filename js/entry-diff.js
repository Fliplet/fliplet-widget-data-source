/**
 * Change-detection for the Data Source Manager's save.
 *
 * Extracted from interface.js so it can be tested: these are pure functions with
 * no DOM or API dependencies. Comparison helpers are injected rather than
 * imported so the module stays free of lodash and Fliplet globals.
 */

// eslint-disable-next-line no-unused-vars
var EntryDiff = (function() {
  'use strict';

  /**
   * Serialise a value with object keys sorted at every depth, so two
   * structurally equal objects always produce the same string. Plain
   * JSON.stringify is key-order sensitive, which would re-commit a JSON cell
   * whose keys came back from the grid in a different order.
   * @param {*} value - Value to serialise
   * @returns {String} Stable JSON serialisation
   */
  function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return '[' + value.map(stableStringify).join(',') + ']';
    }

    return '{' + Object.keys(value).sort().map(function(key) {
      return JSON.stringify(key) + ':' + stableStringify(value[key]);
    }).join(',') + '}';
  }

  /**
   * Normalise a cell value for change detection.
   *
   * Every value is round-tripped through a text grid, so a number stored as 30
   * comes back as the string "30" and a blank cell comes back as "" or
   * undefined. Comparing the raw values marks those rows as edited when the
   * user changed nothing, which on a large data source is the whole source
   * being re-sent. Scalars are compared in their string form, and
   * null/undefined/"" are all treated as blank.
   * @param {*} value - Raw cell value
   * @returns {String} Canonical string form, empty for blanks
   */
  function normalizeValue(value) {
    if (value === null || typeof value === 'undefined') {
      return '';
    }

    if (typeof value === 'object') {
      return stableStringify(value);
    }

    return String(value);
  }

  /**
   * Build a comparable representation of an entry's data. Blank fields are
   * dropped so an empty cell and an absent column compare equal.
   * @param {Object} data - Entry data
   * @returns {Object} Normalised data map
   */
  function normalizeData(data) {
    var normalized = {};

    Object.keys(data || {}).forEach(function(key) {
      var value = normalizeValue(data[key]);

      if (value !== '') {
        normalized[key] = value;
      }
    });

    return normalized;
  }

  /**
   * Work out the row order to persist after a reorder.
   *
   * Rather than renumbering from zero, the stored order values the rows already
   * hold are redistributed across the current visual sequence. Two consequences
   * matter:
   *
   *  - Deleting rows needs no rewrite at all. The surviving values are still in
   *    ascending order, so every row is handed back the value it already had.
   *  - A drag only rewrites the span it actually crossed, even when a delete in
   *    the same save shifted every visual index below it.
   *
   * Sparse orders are preserved, since the pool is whatever the data source
   * already used. If any row has no stored order (never ordered, or inserted
   * through the API) the pool cannot be trusted, so a dense sequence is assigned
   * instead, which heals the data source on the next save.
   * @param {Array} entries - Current entries in visual order
   * @param {Object} originalMap - Cached originals, keyed by entry id
   * @returns {Object} Map of entry id to the order it should be given
   */
  function computeReorderedPositions(entries, originalMap) {
    var positioned = (entries || []).filter(function(entry) {
      return typeof entry.id !== 'undefined' && originalMap[entry.id];
    });

    var stored = positioned.map(function(entry) {
      return originalMap[entry.id].order;
    });

    var complete = stored.every(function(value) {
      return typeof value === 'number';
    });

    var pool = complete
      ? stored.slice().sort(function(a, b) {
        return a - b;
      })
      : positioned.map(function(entry, index) {
        return index;
      });

    var positions = {};

    positioned.forEach(function(entry, index) {
      positions[entry.id] = pool[index];
    });

    return positions;
  }

  /**
   * Determine whether an entry needs committing.
   *
   * Position is only considered when the user dragged a row during this save, and
   * even then only for the rows whose position actually changed. Nothing is
   * derived from the visual index otherwise, so deleting a row no longer makes
   * every row beneath it look changed - on a 15,000-row data source that was a
   * ~3 MB commit taking ~15s, which times out as a 502 (PS-1781).
   * @param {Object} entry - Current entry from the table
   * @param {Object} original - Cached original entry
   * @param {Object|null} positions - Map of id to new order, when rows were moved
   * @param {Function} isEqualFn - Deep equality comparison (e.g. _.isEqual)
   * @returns {Boolean} True when the entry should be committed
   */
  function hasEntryChanged(entry, original, positions, isEqualFn) {
    if (!isEqualFn(normalizeData(entry.data), normalizeData(original.data))) {
      return true;
    }

    if (!positions) {
      return false;
    }

    return positions[entry.id] !== original.order;
  }

  /**
   * Build the commit payload by comparing current entries against the originals.
   * NOTE: mutates entries in place - adds clientId to new entries, deletes id from
   * recovered ones, and stamps order on rows that a reorder has moved.
   * @param {Array} entries - Current entries from the table, in visual order
   * @param {Object} originalMap - Cached originals, keyed by entry id
   * @param {Object} options - { rowsMoved, isEqual, guid }
   * @returns {Object} { entries: [...updated, ...inserted], delete: [...ids] }
   */
  function computeCommitPayload(entries, originalMap, options) {
    entries = entries || [];
    originalMap = originalMap || {};

    var isEqualFn = options.isEqual;
    var guidFn = options.guid;
    var positions = options.rowsMoved
      ? computeReorderedPositions(entries, originalMap)
      : null;

    var inserted = [];
    var updated = [];
    var deleted = [];
    var seen = {};

    entries.forEach(function(entry) {
      // New entry, no id yet
      if (typeof entry.id === 'undefined') {
        entry.clientId = guidFn();
        inserted.push(entry);

        return;
      }

      // Recovered entry whose id is no longer known - treat it as new
      if (!originalMap[entry.id]) {
        delete entry.id;
        entry.clientId = guidFn();
        inserted.push(entry);

        return;
      }

      seen[entry.id] = entry;
    });

    Object.keys(originalMap).forEach(function(id) {
      var original = originalMap[id];
      var entry = seen[original.id];

      if (!entry) {
        deleted.push(original.id);

        return;
      }

      if (!hasEntryChanged(entry, original, positions, isEqualFn)) {
        return;
      }

      // Only carry a position when the row actually needs one; sending it on a
      // data-only edit would overwrite a sparse stored order with a visual index
      if (positions && positions[entry.id] !== original.order) {
        entry.order = positions[entry.id];
      }

      updated.push(entry);
    });

    return {
      entries: updated.concat(inserted),
      delete: deleted
    };
  }

  return {
    normalizeData: normalizeData,
    computeReorderedPositions: computeReorderedPositions,
    hasEntryChanged: hasEntryChanged,
    computeCommitPayload: computeCommitPayload
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EntryDiff;
}
