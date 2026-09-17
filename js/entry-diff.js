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
   * Spacing asked for when the save needs the data source renumbered.
   *
   * Two shapes make a position impossible to express, and both are common: rows
   * carrying no order at all, and rows numbered 0..n-1 with no gaps. Neither can
   * be fixed from here without committing the whole data source, which is the
   * multi-megabyte save this change exists to remove (PS-1781).
   *
   * So the commit carries `normalizeOrder: { gap }` instead, and the API
   * renumbers every live entry to `ROW_NUMBER() OVER (ORDER BY "order" ASC NULLS
   * LAST, id DESC) * gap` before applying the payload. That sort is the
   * platform's own read order - the sequence the manager is already showing - so
   * it moves nothing on screen, and it is deterministic, so this module predicts
   * the result as `(index + 1) * gap` and sends its new rows already numbered
   * into the space the renumber will open. One round trip, and the payload is
   * the rows the user actually touched.
   */
  var MAX_GAP = 1000;

  /**
   * What a stored order can hold. `order` is a 32-bit signed integer in the
   * database, so a value outside this range is not a worse position - it is a
   * rejected write and a failed save, which is the outcome this whole change
   * exists to prevent. Every path that invents a number checks that the span it
   * would write fits, and declines the position when it does not.
   *
   * The renumber does not weaken this and does not drift: it rewrites the whole
   * data source absolutely, to `(index + 1) * gap`, so repeated saves land on
   * the same numbers rather than climbing. What still needs the guard is
   * everything the renumber does not cover - a row appended above the highest
   * order a data source already holds, or inserted below its lowest.
   */
  var MIN_ORDER = -2147483648;
  var MAX_ORDER = 2147483647;

  /**
   * Whether a span of orders can be stored.
   * @param {Number} lowest - Lowest value the span would write
   * @param {Number} highest - Highest value the span would write
   * @returns {Boolean} True when both ends fit the column
   */
  function storable(lowest, highest) {
    return lowest >= MIN_ORDER && highest <= MAX_ORDER;
  }

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
   * Whether a row is new to the data source. A recovered entry whose id the
   * cache no longer knows counts as new too - the commit treats it that way.
   * @param {Object} entry - Entry from the table
   * @param {Object} originalMap - Cached originals, keyed by entry id
   * @returns {Boolean} True when the row has no stored counterpart
   */
  function isNewEntry(entry, originalMap) {
    return typeof entry.id === 'undefined' || !originalMap[entry.id];
  }

  /**
   * Sort rows the way the platform reads a data source: order ASC, rows with no
   * order last, ties broken on descending id. The manager asks for no sort of
   * its own, so this is the sequence it shows, the sequence every app sees, and
   * the sequence the API's renumber walks.
   * @param {Object} a - Row with { id, order }
   * @param {Object} b - Row with { id, order }
   * @returns {Number} Comparator result
   */
  function byReadOrder(a, b) {
    var aNumbered = typeof a.order === 'number';
    var bNumbered = typeof b.order === 'number';

    if (aNumbered && bNumbered && a.order !== b.order) {
      return a.order - b.order;
    }

    if (aNumbered !== bNumbered) {
      return aNumbered ? -1 : 1;
    }

    return b.id - a.id;
  }

  /**
   * Ascending numeric sort.
   * @param {Number} a - First value
   * @param {Number} b - Second value
   * @returns {Number} Comparator result
   */
  function ascending(a, b) {
    return a - b;
  }

  /**
   * Whether a set of stored orders can express an arrangement at all. Rows with
   * no order always sort after numbered ones, and rows sharing an order are
   * separated by id - which the manager and the platform read in opposite
   * directions - so neither can be positioned against.
   * @param {Array} stored - Stored order values
   * @returns {Boolean} True when every row carries a distinct number
   */
  function ordersAreUsable(stored) {
    return stored.every(function(value) {
      return typeof value === 'number';
    }) && new Set(stored).size === stored.length;
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
   * already used. A pool that cannot express an arrangement is not redistributed
   * at all: the caller asks the API to renumber instead, and calls this again
   * against the numbering that will produce.
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

    if (!ordersAreUsable(stored)) {
      return {};
    }

    var pool = stored.slice().sort(ascending);
    var positions = {};

    positioned.forEach(function(entry, index) {
      positions[entry.id] = pool[index];
    });

    return positions;
  }

  /**
   * Whether the visual sequence differs from the one the data source holds.
   *
   * The drag flag on its own only means the user dragged something, not that
   * anything ended up somewhere new - and asking for a renumber a save does not
   * need would rewrite every row for nothing.
   * @param {Array} positioned - Entries that exist in the data source, in visual order
   * @param {Object} originalMap - Cached originals, keyed by entry id
   * @returns {Boolean} True when at least one row sits somewhere else
   */
  function sequenceMoved(positioned, originalMap) {
    var baseline = positioned.map(function(entry) {
      return { id: entry.id, order: originalMap[entry.id].order };
    }).sort(byReadOrder);

    return positioned.some(function(entry, index) {
      return baseline[index].id !== entry.id;
    });
  }

  /**
   * The runs of consecutive new rows in a save, each with the position of the
   * stored row above it. A run between two stored rows needs room between their
   * orders; one at either end of the grid does not.
   * @param {Array} entries - Current entries in visual order
   * @param {Object} originalMap - Cached originals, keyed by entry id
   * @returns {Array} [{ count, above, interior }]
   */
  function insertRuns(entries, originalMap) {
    var runs = [];
    var above = -1;
    var index = 0;
    var count;

    while (index < entries.length) {
      if (!isNewEntry(entries[index], originalMap)) {
        above += 1;
        index += 1;

        continue;
      }

      count = 0;

      while (index < entries.length && isNewEntry(entries[index], originalMap)) {
        count += 1;
        index += 1;
      }

      runs.push({
        count: count,
        above: above,
        interior: above >= 0 && index < entries.length
      });
    }

    return runs;
  }

  /**
   * Whether every run of new rows fits between the orders of its neighbours.
   *
   * The row at visual position j ends up holding the j-th smallest stored order
   * - handed back its own when nothing moved, or the pool value a reorder gives
   * it - so the room a run has is the gap between consecutive values of the
   * sorted pool.
   * @param {Array} pool - Stored orders of the positioned rows, ascending
   * @param {Array} runs - Runs of new rows, from insertRuns
   * @returns {Boolean} True when nothing has to move to seat them
   */
  function placementFits(pool, runs) {
    return runs.every(function(run) {
      return !run.interior || pool[run.above + 1] - pool[run.above] - 1 >= run.count;
    });
  }

  /**
   * Spacing to ask the API to renumber with.
   *
   * Wide enough to seat the rows being added between any two existing ones - a
   * large paste is one run and has to fit in a single gap - and narrow enough
   * that the whole data source still fits the column with a gap to spare above
   * it for the next append.
   *
   * MAX_GAP is a default, not a ceiling: a run bigger than it raises the gap
   * past it, because 1,000 is only the spacing that leaves room for the *next*
   * insert, while seating this one is what the save is for - a 1,500-row paste
   * asks for 1,501. The API has no such cap; its only bound is the one checked
   * below, so raising it is accepted and clamping to 1,000 would send a paste
   * that cannot fit where the user pasted it.
   *
   * The upper bound is the API's own: it rejects a commit whose
   * `gap * (liveCount + 1)` would run off the column with a 400, and a failed
   * save is the outcome this change exists to prevent, so the two have to agree.
   * Nothing this side reaches it - `MAX_GAP` alone needs 2.1M rows, and the
   * raise for a run needs one bigger than 2147483647 / liveCount - so it is
   * here for that agreement rather than for a case anything exercises.
   * @param {Number} liveCount - Rows the data source holds now
   * @param {Array} runs - Runs of new rows, from insertRuns
   * @returns {Number} The gap to ask for, or 0 when the column cannot hold one
   */
  function gapForNormalize(liveCount, runs) {
    var needed = 1;
    var gap = Math.max(1, Math.min(MAX_GAP, Math.floor(MAX_ORDER / (liveCount + 1))));

    runs.forEach(function(run) {
      if (run.interior && run.count + 1 > needed) {
        needed = run.count + 1;
      }
    });

    if (gap < needed) {
      gap = needed;
    }

    return storable(gap, gap * (liveCount + 1)) ? gap : 0;
  }

  /**
   * The orders the data source will hold once the API has renumbered it. The
   * renumber walks the platform's read order, which is the sequence the manager
   * is already showing, so this is predicted here rather than read back.
   * @param {Object} originalMap - Cached originals, keyed by entry id
   * @param {Number} gap - Spacing the renumber will use
   * @returns {Object} Originals carrying their post-renumber orders
   */
  function normalizedOrders(originalMap, gap) {
    var normalized = {};

    Object.keys(originalMap).map(function(key) {
      return originalMap[key];
    }).sort(byReadOrder).forEach(function(original, index) {
      normalized[original.id] = {
        id: original.id,
        data: original.data,
        order: (index + 1) * gap
      };
    });

    return normalized;
  }

  /**
   * Give newly inserted rows a position that matches where the user put them.
   *
   * A new row carries no order, and the API stores null, which sorts after every
   * numbered row. That is right for an append but wrong for insert-before or
   * insert-after, which the toolbar offers - the row would reload at the end.
   *
   * Each new row is slotted into the gap between the settled orders of its
   * neighbours. The caller has already made sure there is a gap to slot into, by
   * asking the API to renumber where there was not; what is left here is the
   * arithmetic, and the one thing it still declines - a value the column cannot
   * hold, which is a rejected write rather than a worse position.
   * @param {Array} entries - Current entries in visual order
   * @param {Object} originalMap - Cached originals, keyed by entry id
   * @param {Object} positions - Positions already decided for existing rows
   * @returns {Object} { inserts: Map index to order, unplaced: Number }
   */
  function computeInsertPositions(entries, originalMap, positions) {
    var inserts = {};
    // New rows whose position could not be honoured. They still save - they
    // just reload somewhere other than where the user dropped them, which is
    // the one thing about this that a user cannot see coming.
    var unplaced = 0;

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

      if (isNewEntry(entry, originalMap)) {
        return typeof inserts[index] === 'number' ? inserts[index] : null;
      }

      var pending = positions && positions[entry.id];

      return typeof pending === 'number' ? pending : originalMap[entry.id].order;
    }

    var index = 0;

    while (index < entries.length) {
      if (!isNewEntry(entries[index], originalMap)) {
        index += 1;

        continue;
      }

      // A run of consecutive new rows
      var start = index;

      while (index < entries.length && isNewEntry(entries[index], originalMap)) {
        index += 1;
      }

      var count = index - start;
      var before = start > 0 ? settledOrderAt(start - 1) : null;
      var after = settledOrderAt(index);
      var step = 1;
      var base;
      var i;

      // Nothing numbered on either side. That is a grid typed into from empty,
      // where the run is the whole data source. Anywhere else it means the
      // renumber was declined, and numbering only the run would jump it ahead of
      // every row this save never touched.
      if (before === null && after === null) {
        if (start !== 0 || index !== entries.length) {
          unplaced += count;

          continue;
        }

        for (i = 0; i < count; i++) {
          inserts[i] = i;
        }

        continue;
      }

      if (before === null) {
        base = after - count;
      } else if (after === null) {
        base = before + 1;
      } else {
        step = Math.max(1, Math.floor((after - before) / (count + 1)));
        base = before + step;
      }

      var highest = base + (step * (count - 1));

      // Either the neighbours left no room after all - only reachable when the
      // renumber was declined - or the span runs off the end of the column,
      // which is a rejected write rather than a row in the wrong place.
      if ((after !== null && highest >= after) || !storable(base, highest)) {
        // One row declined at the very bottom of the grid is not misplaced: an
        // unnumbered row sorts after every numbered one, so it reloads exactly
        // where it was dropped. Only a run reverses there - unnumbered rows are
        // read newest id first - and anywhere else the row moves. Reporting the
        // harmless case teaches the user to ignore the message that matters.
        if (after !== null || count > 1) {
          unplaced += count;
        }

        continue;
      }

      var next = base;

      for (i = start; i < start + count; i++) {
        inserts[i] = next;
        next += step;
      }
    }

    return { inserts: inserts, unplaced: unplaced };
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
   * How many rows in this save are new - no id, or an id the cache no longer
   * knows, which the commit treats as new too.
   * @param {Array} entries - Current entries in visual order
   * @param {Object} originalMap - Cached originals, keyed by entry id
   * @returns {Number} Count of new rows
   */
  function countNewRows(entries, originalMap) {
    return (entries || []).filter(function(entry) {
      return isNewEntry(entry, originalMap);
    }).length;
  }

  /**
   * Build the commit payload by comparing current entries against the originals.
   * NOTE: mutates entries in place - adds clientId to new entries, deletes id from
   * recovered ones, and stamps order on rows that a reorder has moved.
   * @param {Array} entries - Current entries from the table, in visual order
   * @param {Object} originalMap - Cached originals, keyed by entry id
   * @param {Object} options - { rowsMoved, viewMatchesStoredOrder, isEqual, guid }
   * @returns {Object} { entries, delete, normalizeOrder, declined }
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
    // 15,000-row source, all of it. The API can make room for a row; it cannot
    // infer where the user meant it to go. Positions are left alone until the
    // view is the stored order again.
    var viewMatchesStoredOrder = options.viewMatchesStoredOrder !== false;

    var positioned = entries.filter(function(entry) {
      return !isNewEntry(entry, originalMap);
    });
    var stored = positioned.map(function(entry) {
      return originalMap[entry.id].order;
    });
    var runs = insertRuns(entries, originalMap);
    var newRows = countNewRows(entries, originalMap);
    var moved = !!options.rowsMoved
      && viewMatchesStoredOrder
      && sequenceMoved(positioned, originalMap);

    // Only a save with somewhere to put a row asks for a renumber, and only when
    // the orders the data source holds cannot seat it. One that can takes the
    // same path it always did, byte for byte. Asking on a save that positions
    // nothing would rewrite every row for nothing - and a save has to settle:
    // reopening the data source and saving it again must write nothing at all.
    var normalizeOrder = null;
    var orders = originalMap;
    var gap;

    if (viewMatchesStoredOrder && (newRows || moved)
      && !(ordersAreUsable(stored) && placementFits(stored.slice().sort(ascending), runs))) {
      // MERGE HAZARD (#275, pagination). Both the row count and the predicted
      // numbering below take `originalMap` to be the whole data source, because
      // that is what the API renumbers - every live entry, not a page of them.
      // Cache one page here instead and the client predicts a numbering the
      // server never writes, and every insert lands in the wrong place. If this
      // file gains pagination, the renumber has to be asked for against the
      // real live count and the placement recomputed from what comes back.
      gap = gapForNormalize(Object.keys(originalMap).length, runs);

      if (gap) {
        normalizeOrder = { gap: gap };
        orders = normalizedOrders(originalMap, gap);
      }
    }

    // Everything below reads the orders the data source will hold once this
    // payload is applied, which are the renumbered ones whenever a renumber was
    // asked for. Comparing against the values it holds now would re-send the
    // whole data source, which is the save this change exists to prevent.
    var positions = moved ? computeReorderedPositions(entries, orders) : null;

    // Skipping the placement pass is still a decision about every new row in the
    // save: each one keeps the position the API gives an unordered row rather
    // than the one the user dropped it on, so it is reported rather than silent.
    var placed = viewMatchesStoredOrder
      ? computeInsertPositions(entries, orders, positions)
      : { inserts: {}, unplaced: newRows };

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
      if (!orders[entry.id]) {
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

    Object.keys(orders).forEach(function(id) {
      var original = orders[id];
      var entry = seen[original.id];

      if (!entry) {
        deleted.push(original.id);

        return;
      }

      var finalOrder;

      if (positions && Object.prototype.hasOwnProperty.call(positions, entry.id)) {
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

    var committed = updated.concat(inserted);

    // Never on its own. The commit endpoint reads an empty `entries` as a full
    // replace and deletes every row in the data source, so a renumber with
    // nothing to apply is not a cheap no-op - it is the whole data source. It
    // has nothing to do anyway: the renumber exists to seat the rows below it.
    if (!committed.length) {
      normalizeOrder = null;
    }

    return {
      entries: committed,
      delete: deleted,

      // Renumber every live entry before applying the payload above. Null on a
      // data source whose own orders can already hold the arrangement.
      normalizeOrder: normalizeOrder,

      // What this save could not persist. Declining silently is how a user sees
      // the grid accept a row and then a reload move it, so the caller says so.
      declined: {
        // A sorted grid is not an arrangement, so nothing about a new row's
        // position can be read off it - and unlike everything else here, the
        // user can undo it themselves by clearing the sort.
        sorted: !viewMatchesStoredOrder,
        rows: placed.unplaced || 0
      }
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
