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
   * How many existing rows one added row may renumber.
   *
   * Two shapes make placing a row expensive, and an integer `order` column
   * leaves no way around either:
   *
   *  - Rows that carry no order. An unnumbered row always sorts after a
   *    numbered one, so holding a new row below k unnumbered rows means
   *    numbering all k of them.
   *  - Rows numbered 0..n-1 with no gaps. Nothing fits between two consecutive
   *    integers, so the rows above or the rows below have to shift - whichever
   *    side is shorter, which at the middle is half the data source.
   *
   * Both are the whole-dataset commit this change exists to remove: 15,000
   * entries measured at 3.22 MB and ~15s, answered with a 502 (PS-1781), and
   * 7,500 of them still ~1.7 MB and ~7s. So placement is bought only while it
   * stays this cheap - 500 rows measured at ~110 KB, well under a second. Past
   * that the row keeps its position in the grid for this session and reloads at
   * the end of the data source, which is slower to notice than a failed save
   * but never loses the row.
   */
  var MAX_ORDER_WRITES = 500;

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

    // Repeats are as unusable as gaps: two rows sharing an order are separated
    // by id, which the manager and the platform read in opposite directions.
    var complete = stored.every(function(value) {
      return typeof value === 'number';
    }) && new Set(stored).size === stored.length;

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

    // Nothing usable is stored, so the rows currently read back on their ids.
    // Numbering all of them would commit the whole data source for one drag, so
    // only the prefix up to the last row that actually moved is numbered. The
    // rows past it still read correctly on their ids alone - and because the
    // manager reads a data source exactly as the rest of the platform does,
    // that tail means the same thing to every consumer.
    // The rows read back numbered-first, then the unnumbered ones by descending
    // id - so the baseline has to be built the same way. Sorting on ascending id
    // made a data source with both kinds look reordered when nothing had moved.
    var baseline = positioned.slice().sort(function(a, b) {
      var aOrder = originalMap[a.id].order;
      var bOrder = originalMap[b.id].order;
      var aNumbered = typeof aOrder === 'number';
      var bNumbered = typeof bOrder === 'number';

      if (aNumbered && bNumbered && aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      if (aNumbered !== bNumbered) {
        return aNumbered ? -1 : 1;
      }

      return b.id - a.id;
    });

    var lastMoved = -1;

    positioned.forEach(function(entry, index) {
      if (baseline[index].id !== entry.id) {
        lastMoved = index;
      }
    });

    var renumbered = {};

    if (lastMoved < 0) {
      return renumbered;
    }

    // The rows past the prefix keep whatever order they already hold, so the
    // prefix has to be numbered below the lowest of them. Starting at zero
    // collided with rows nobody touched: a data source holding -1, 0, 1 and a
    // null would answer a drag by writing 1 over a row already sitting at 1,
    // and the two then separated on id rather than on the arrangement.
    var tailMin = null;

    for (var t = lastMoved + 1; t < positioned.length; t++) {
      var tailOrder = originalMap[positioned[t].id].order;

      if (typeof tailOrder === 'number' && (tailMin === null || tailOrder < tailMin)) {
        tailMin = tailOrder;
      }
    }

    var count = lastMoved + 1;
    var first = tailMin === null ? 0 : tailMin - count;

    for (var i = 0; i <= lastMoved; i++) {
      renumbered[positioned[i].id] = first + i;
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
   * neighbours. Where the neighbours leave no room, something has to move: the
   * rows below are pushed further down, or the rows above are pulled down into
   * the space beneath them, whichever is fewer rows. Where the row above has no
   * order at all there is nothing to sit after, so the rows above are numbered
   * - up to MAX_ORDER_WRITES of them, past which the new row is left where an
   * unnumbered row reads.
   * @param {Array} entries - Current entries in visual order
   * @param {Object} originalMap - Cached originals, keyed by entry id
   * @param {Object} positions - Positions already decided for existing rows
   * @returns {Object} { inserts: Map index to order, updates: Map id to order }
   */
  function computeInsertPositions(entries, originalMap, positions) {
    var inserts = {};
    var updates = {};

    function isNew(entry) {
      return typeof entry.id === 'undefined' || !originalMap[entry.id];
    }

    /**
     * Order the row at this index will hold once the save is applied, for both
     * kinds of row. A new row placed by an earlier run counts just as much as a
     * stored one: reading it as unnumbered is what made a second insertion
     * ignore the first and land in the wrong place.
     * @param {Number} index - Position in the visual sequence
     * @returns {Number|null} The settled order, or null when it has none
     */
    function settledOrderAt(index) {
      var entry = entries[index];

      if (!entry) {
        return null;
      }

      if (isNew(entry)) {
        return typeof inserts[index] === 'number' ? inserts[index] : null;
      }

      // A row displaced by an earlier insertion in this same pass already has a
      // new position; reading its stored one would hand the next insertion a
      // stale neighbour and produce a duplicate order.
      if (typeof updates[entry.id] === 'number') {
        return updates[entry.id];
      }

      var pending = positions && positions[entry.id];

      return typeof pending === 'number' ? pending : originalMap[entry.id].order;
    }

    /**
     * Record an order for whichever kind of row sits at this index. New rows
     * are keyed by position because they have no id yet.
     * @param {Number} index - Position in the visual sequence
     * @param {Number} order - Order to give it
     * @returns {undefined}
     */
    function assignOrder(index, order) {
      if (isNew(entries[index])) {
        inserts[index] = order;

        return;
      }

      updates[entries[index].id] = order;
    }

    /**
     * Lowest order held by anything from this index onwards. Anything written
     * above has to stay below it, or it collides with rows nobody touched.
     * @param {Number} from - Index to start looking from
     * @returns {Number|null} The lowest settled order, or null when there is none
     */
    function lowestOrderFrom(from) {
      var lowest = null;

      for (var i = from; i < entries.length; i++) {
        var order = settledOrderAt(i);

        if (typeof order === 'number' && (lowest === null || order < lowest)) {
          lowest = order;
        }
      }

      return lowest;
    }

    /**
     * Number the rows above an insertion point so the new rows can sit after
     * them.
     *
     * An unnumbered row always sorts after every numbered one, so a new row
     * dropped below unnumbered rows cannot be given an order of its own - any
     * number would lift it above them. The only thing that pins it is numbering
     * what is above it, and only the rows that are not already usable are
     * touched, in the sequence they are shown.
     * @param {Number} runStart - Index of the first new row in the run
     * @param {Number} runEnd - Index just past the run
     * @param {Number} runCount - How many new rows the run holds
     * @returns {Boolean} True when the rows above were numbered
     */
    function anchorRowsAbove(runStart, runEnd, runCount) {
      var tailMin = lowestOrderFrom(runEnd);
      var pending = [];
      var assigned = null;
      var i;

      for (i = 0; i < runStart; i++) {
        var current = settledOrderAt(i);

        // Already numbered above everything before it, so it stays as it is
        if (typeof current === 'number' && (assigned === null || current > assigned)) {
          assigned = current;

          continue;
        }

        assigned = assigned === null ? 0 : assigned + 1;
        pending.push({ index: i, order: assigned });
      }

      if (!pending.length || pending.length > MAX_ORDER_WRITES) {
        return false;
      }

      // No room left for the run itself between the anchors and the rows below
      if (tailMin !== null && assigned + runCount >= tailMin) {
        return false;
      }

      pending.forEach(function(row) {
        assignOrder(row.index, row.order);
      });

      return true;
    }

    /**
     * Make room for a run by moving the rows above it down, rather than moving
     * every row below it further down.
     * @param {Number} runStart - Index of the first new row in the run
     * @param {Number} runCount - How many new rows the run holds
     * @param {Number} ceiling - Order of the row following the run
     * @returns {Boolean} True when the rows above were moved and the run placed
     */
    function pullDownRowsAbove(runStart, runCount, ceiling) {
      var i;

      if (runStart > MAX_ORDER_WRITES) {
        return false;
      }

      var base = ceiling - (runStart + runCount);

      for (i = 0; i < runStart + runCount; i++) {
        assignOrder(i, base + i);
      }

      return true;
    }

    /**
     * Number a run sitting at the very top, where there is nothing above it and
     * nothing numbered below.
     *
     * One new row can be left alone here - unnumbered rows read newest first,
     * so the newest row already reads first, which is where it was dropped. A
     * run of several cannot: they would all reload in reverse of the order they
     * were typed in.
     * @param {Number} runCount - How many new rows the run holds
     * @param {Number} runEnd - Index just past the run
     * @returns {Boolean} True when the run was numbered
     */
    function numberRunAtTop(runCount, runEnd) {
      var tailMin = lowestOrderFrom(runEnd);
      var base = tailMin === null ? 0 : tailMin - runCount;

      for (var i = 0; i < runCount; i++) {
        inserts[i] = base + i;
      }

      return true;
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

      // The row above carries no order, so there is nothing to sit after.
      // Numbering the rows above is what pins the new row; where there are too
      // many of them to write, it stays unnumbered.
      if (start > 0 && settledOrderAt(start - 1) === null) {
        anchorRowsAbove(start, index, count);
      }

      var before = start > 0 ? settledOrderAt(start - 1) : null;
      var cursor = index;
      var after = settledOrderAt(cursor);

      // Widen past following rows until the run fits, renumbering those we pass
      var displaced = [];
      // The order of the row directly below the run, before the walk moves the
      // cursor past it - that is the ceiling the rows above have to fit under
      var firstAfter = after;
      var pulled = false;
      var triedPulling = false;

      while (after !== null && before !== null
        && after - before - 1 < count + displaced.length
        && displaced.length <= MAX_ORDER_WRITES) {
        // A sequence with no gaps left has to give somewhere. Walking down for
        // slack passes every row to the end of a packed data source - inserting
        // near the top of a 15,000-row one wrote 14,997 of them, and into the
        // middle 7,501, both inside the timeout this change exists to remove.
        // Moving the rows above down instead costs one write per row above the
        // insertion point, so once the walk has passed that many rows, the
        // other side is the cheaper one.
        if (!triedPulling && displaced.length >= start) {
          triedPulling = true;

          if (pullDownRowsAbove(start, count, firstAfter)) {
            pulled = true;

            break;
          }
        }

        displaced.push(cursor);
        cursor += 1;
        after = settledOrderAt(cursor);
      }

      if (pulled) {
        continue;
      }

      // Neither side is cheap enough: the walk hit the limit and there were
      // more rows above it than the limit too. Leave the run unnumbered rather
      // than commit half the data source to position one row.
      if (after !== null && before !== null
        && after - before - 1 < count + displaced.length) {
        continue;
      }

      // Still nothing numbered on either side. At the very top that is fixable
      // and cheap - see numberRunAtTop. Anywhere else it means the rows above
      // could not be numbered, and numbering only the run would jump it ahead
      // of every existing row, which is further from where the user put it than
      // leaving it alone.
      if (before === null && after === null) {
        if (start === 0 && count > 1) {
          numberRunAtTop(count, index);
        }

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
        assignOrder(displaced[d], next);
        next += step;
      }
    }

    return { inserts: inserts, updates: updates };
  }

  /**
   * Determine whether an entry needs committing.
   *
   * Only the data is compared. Position is decided separately, by the caller,
   * because it depends on what the whole save is doing rather than on one row -
   * and nothing is derived from the visual index, so deleting a row no longer
   * makes every row beneath it look changed. On a 15,000-row data source that
   * was a ~3 MB commit taking ~15s, which times out as a 502 (PS-1781).
   * @param {Object} entry - Current entry from the table
   * @param {Object} original - Cached original entry
   * @param {Function} isEqualFn - Deep equality comparison (e.g. _.isEqual)
   * @returns {Boolean} True when the entry's data should be committed
   */
  function hasEntryChanged(entry, original, isEqualFn) {
    return !isEqualFn(normalizeData(entry.data), normalizeData(original.data));
  }

  /**
   * Build the commit payload by comparing current entries against the originals.
   * NOTE: mutates entries in place - adds clientId to new entries, deletes id from
   * recovered ones, and stamps order on rows that a reorder has moved.
   * @param {Array} entries - Current entries from the table, in visual order
   * @param {Object} originalMap - Cached originals, keyed by entry id
   * @param {Object} options - { rowsMoved, viewMatchesStoredOrder, isEqual, guid }
   * @returns {Object} { entries: [...updated, ...inserted], delete: [...ids] }
   */
  function computeCommitPayload(entries, originalMap, options) {
    entries = entries || [];
    originalMap = originalMap || {};

    var isEqualFn = options.isEqual;
    var guidFn = options.guid;

    // The grid can be showing a column sort rather than the stored sequence.
    // Nothing about a position can be read off it then: the row above a new one
    // is not the row it will reload after, and treating the sorted sequence as
    // an arrangement to persist writes the sort into the data source - on a
    // 15,000-row source, all of it. Positions are left alone until the view is
    // the stored order again.
    var viewMatchesStoredOrder = options.viewMatchesStoredOrder !== false;
    var positions = options.rowsMoved && viewMatchesStoredOrder
      ? computeReorderedPositions(entries, originalMap)
      : null;

    // New rows need a position of their own, so insert-before/after lands where
    // the user put it rather than at the end
    var placed = viewMatchesStoredOrder
      ? computeInsertPositions(entries, originalMap, positions)
      : { inserts: {}, updates: {} };

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

      // One decision per row. A row displaced by an insertion was placed against
      // its settled neighbours, so that value supersedes anything the reorder
      // proposed - falling back to the reorder value here left two rows sharing
      // an order.
      var finalOrder;

      if (Object.prototype.hasOwnProperty.call(placed.updates, entry.id)) {
        finalOrder = placed.updates[entry.id];
      } else if (positions && Object.prototype.hasOwnProperty.call(positions, entry.id)) {
        finalOrder = positions[entry.id];
      }

      var orderChanged = typeof finalOrder === 'number' && finalOrder !== original.order;

      if (!orderChanged && !hasEntryChanged(entry, original, isEqualFn)) {
        return;
      }

      // Only carry a position when the row actually needs one; sending it on a
      // data-only edit would overwrite a sparse stored order with a visual index
      if (orderChanged) {
        entry.order = finalOrder;
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
