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

    if (complete) {
      var pool = stored.slice().sort(function(a, b) {
        return a - b;
      });

      var positions = {};

      positioned.forEach(function(entry, index) {
        positions[entry.id] = pool[index];
      });

      return positions;
    }

    // Nothing usable is stored, so the rows currently read back in id order.
    // Numbering all of them would commit the whole data source for one drag, so
    // only the prefix up to the last row that actually moved is numbered - the
    // rows past it still read back in the right order on their ids alone.
    var baseline = positioned.slice().sort(function(a, b) {
      return a.id - b.id;
    });

    var lastMoved = -1;

    positioned.forEach(function(entry, index) {
      if (baseline[index].id !== entry.id) {
        lastMoved = index;
      }
    });

    var renumbered = {};

    for (var i = 0; i <= lastMoved; i++) {
      renumbered[positioned[i].id] = i;
    }

    return renumbered;
  }

  /**
   * Give newly inserted rows a position that matches where the user put them.
   *
   * A new row carries no order, and the API stores null, which sorts after every
   * numbered row. That is right for an append but wrong for insert-before or
   * insert-after, which the toolbar offers - the row would reload at the end.
   *
   * Each new row is slotted into the gap between the stored orders of its
   * neighbours. Where the neighbours leave no room, the run is pushed past the
   * following row instead, and that row is renumbered too; the rows before the
   * insertion point are never touched.
   * @param {Array} entries - Current entries in visual order
   * @param {Object} originalMap - Cached originals, keyed by entry id
   * @param {Object} positions - Positions already decided for existing rows
   * @returns {Object} { inserts: Map index to order, updates: Map id to order }
   */
  function computeInsertPositions(entries, originalMap, positions) {
    var inserts = {};
    var updates = {};

    // Order each existing row will hold once this save is applied
    function settledOrder(entry) {
      if (!entry || typeof entry.id === 'undefined' || !originalMap[entry.id]) {
        return null;
      }

      var pending = positions && positions[entry.id];

      return typeof pending === 'number' ? pending : originalMap[entry.id].order;
    }

    function isNew(entry) {
      return typeof entry.id === 'undefined' || !originalMap[entry.id];
    }

    var index = 0;

    while (index < entries.length) {
      if (!isNew(entries[index])) {
        index += 1;

        continue;
      }

      // A run of consecutive new rows
      var start = index;

      while (index < entries.length && isNew(entries[index])) {
        index += 1;
      }

      var count = index - start;
      var before = start > 0 ? settledOrder(entries[start - 1]) : null;
      var cursor = index;
      var after = cursor < entries.length ? settledOrder(entries[cursor]) : null;

      // Widen past following rows until the run fits, renumbering those we pass
      var displaced = [];

      while (after !== null && before !== null && after - before - 1 < count) {
        displaced.push(entries[cursor]);
        cursor += 1;
        after = cursor < entries.length ? settledOrder(entries[cursor]) : null;
      }

      // Nothing numbered on either side: the data source has no stored order at
      // all, so leave these rows without one. They sort after the numbered rows
      // and among themselves by id, which is the order they were added. Giving
      // them a number here would jump them ahead of every existing row.
      if (before === null && after === null) {
        continue;
      }

      var needed = count + displaced.length;
      var base = before === null ? after - needed : before + 1;
      var step = 1;

      if (before !== null && after !== null) {
        step = Math.max(1, Math.floor((after - before) / (needed + 1)));
        base = before + step;
      }

      var next = base;

      for (var i = start; i < start + count; i++) {
        inserts[i] = next;
        next += step;
      }

      for (var d = 0; d < displaced.length; d++) {
        updates[displaced[d].id] = next;
        next += step;
      }
    }

    return { inserts: inserts, updates: updates };
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

    if (!positions || !Object.prototype.hasOwnProperty.call(positions, entry.id)) {
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

    // New rows need a position of their own, so insert-before/after lands where
    // the user put it rather than at the end
    var placed = computeInsertPositions(entries, originalMap, positions);

    var inserted = [];
    var updated = [];
    var deleted = [];
    var seen = {};

    entries.forEach(function(entry, index) {
      // New entry, no id yet
      if (typeof entry.id === 'undefined') {
        entry.clientId = guidFn();

        if (typeof placed.inserts[index] === 'number') {
          entry.order = placed.inserts[index];
        }

        inserted.push(entry);

        return;
      }

      // Recovered entry whose id is no longer known - treat it as new
      if (!originalMap[entry.id]) {
        delete entry.id;
        entry.clientId = guidFn();

        if (typeof placed.inserts[index] === 'number') {
          entry.order = placed.inserts[index];
        }

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

      var displacedOrder = placed.updates[entry.id];
      var isDisplaced = typeof displacedOrder === 'number' && displacedOrder !== original.order;

      if (!isDisplaced && !hasEntryChanged(entry, original, positions, isEqualFn)) {
        return;
      }

      // Only carry a position when the row actually needs one; sending it on a
      // data-only edit would overwrite a sparse stored order with a visual index
      if (isDisplaced) {
        entry.order = displacedOrder;
      } else if (positions
        && Object.prototype.hasOwnProperty.call(positions, entry.id)
        && positions[entry.id] !== original.order) {
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
    computeInsertPositions: computeInsertPositions,
    computeReorderedPositions: computeReorderedPositions,
    hasEntryChanged: hasEntryChanged,
    computeCommitPayload: computeCommitPayload
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EntryDiff;
}
