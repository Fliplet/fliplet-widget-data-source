/**
 * Pagination utility functions for the Data Source Manager.
 * Extracted for testability — these are pure functions with no DOM or API dependencies.
 */

// eslint-disable-next-line no-unused-vars
var Pagination = (function() {
  'use strict';

  /**
   * Compute pagination metadata from total entries and page size
   * @param {Number} totalEntries - Total number of entries in the data source
   * @param {Number} pageSize - Number of entries per page
   * @param {Number} currentPage - Current page index (0-based)
   * @returns {Object} Pagination metadata
   */
  function computePageInfo(totalEntries, pageSize, currentPage) {
    var totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));

    // Clamp current page to valid range
    if (currentPage >= totalPages) {
      currentPage = Math.max(0, totalPages - 1);
    }

    if (currentPage < 0) {
      currentPage = 0;
    }

    var startEntry = totalEntries === 0 ? 0 : (currentPage * pageSize) + 1;
    var endEntry = Math.min((currentPage + 1) * pageSize, totalEntries);

    return {
      currentPage: currentPage,
      totalPages: totalPages,
      totalEntries: totalEntries,
      startEntry: startEntry,
      endEntry: endEntry,
      hasPrev: currentPage > 0,
      hasNext: currentPage < totalPages - 1,
      offset: currentPage * pageSize,
      limit: pageSize
    };
  }

  /**
   * Compute the commit payload by comparing current entries against original cached entries.
   * Separates entries into inserted, updated, and deleted.
   * NOTE: Mutates entries in place — adds clientId to new entries, deletes id from recovered entries.
   * @param {Array} entries - Current entries from the table
   * @param {Object} originalMap - Map of entry ID → original entry (from cacheOriginalEntries)
   * @param {Function} isEqualFn - Deep equality comparison function (e.g. _.isEqual)
   * @param {Function} guidFn - Function to generate unique client IDs
   * @returns {Object} { entries: [...inserted, ...updated], delete: [...deletedIds] }
   */
  function computeCommitPayload(entries, originalMap, isEqualFn, guidFn) {
    entries = entries || [];

    var inserted = [];
    var updated = [];
    var deleted = [];
    var seenIds = {};

    entries.forEach(function(entry) {
      // New entry (no ID)
      if (typeof entry.id === 'undefined') {
        entry.clientId = guidFn();
        inserted.push(entry);

        return;
      }

      // Recovered entry (ID not in originals — treat as new)
      if (!originalMap[entry.id]) {
        delete entry.id;
        entry.clientId = guidFn();
        inserted.push(entry);

        return;
      }

      seenIds[entry.id] = entry;
    });

    // Find deleted and updated entries
    Object.keys(originalMap).forEach(function(id) {
      var original = originalMap[id];
      var entry = seenIds[original.id];

      if (!entry) {
        deleted.push(original.id);

        return;
      }

      if (!isEqualFn(entry, original)) {
        updated.push(entry);
      }
    });

    return {
      entries: updated.concat(inserted),
      delete: deleted
    };
  }

  /**
   * Decide each entry's `order` for the commit payload, without assuming a
   * row's stored order is dense, 0-based, or page-aligned (PS-2072 / PS-1781).
   *
   * getData() (spreadsheet.js) re-derives every entry's `order` from its plain
   * visual rank within the currently loaded page, with no notion of pagination
   * and no idea whether the row actually moved. `order` is a nullable,
   * non-unique integer column that the API both permits and actively produces
   * as NULL (SSO provisioning, the public insert endpoint), and that #277's
   * spaced ordering deliberately leaves sparse — so rank cannot stand in for a
   * row's real stored position.
   *
   * Two earlier designs failed here, and both failures are worth keeping
   * written down because the fix is shaped by them:
   *
   * - Inferring "did a reorder happen" by comparing the page's visual sequence
   *   against the sequence its cached orders imply is blind exactly where those
   *   orders tie (duplicates, or multiple NULLs). A genuine drag on an all-NULL
   *   page read as "nothing changed" and was silently discarded.
   * - Writing `rank + pageOffset` on a reorder round-trips the page's
   *   *internal* sequence but not its *global* position. Those values describe
   *   a position in the page, untouched pages keep their real values, and the
   *   two number lines don't line up. Postgres sorts NULL last under
   *   `ORDER BY "order" ASC` (interface.js's own sort), so a page renumbered to
   *   `500..999` jumps ahead of every still-NULL page — one drag on page 2
   *   relocates all 500 of its rows within the data source.
   *
   * So the reorder signal is Handsontable's own `afterRowMove` (`didReorder`,
   * via spreadsheet.js's `hasRowsMoved`), and the values come from the band of
   * orders the page already occupies rather than from rank:
   *
   * - No reorder: every known row keeps its own true order, untouched, whatever
   *   shape it has. An ordinary save can never rewrite an order.
   * - A reorder, and every row on the page holds a distinct number: the page's
   *   own stored values are sorted and replayed onto the new visual sequence.
   *   The set of values in the data source is unchanged — only which row holds
   *   which — so sparse spacing (#277) survives and only the rows that actually
   *   moved reach the payload. This is the case that matters most.
   * - A reorder the pool can't be replayed for (values repeat, some are NULL,
   *   or rows were added in the same save), but the band `[bandMin, bandMax]`
   *   has room for every row: the page packs into the low end of that band.
   *   Less tidy, and it commits the whole page, but every value still sits
   *   inside orders these rows already held, so the page keeps its global slot.
   * - A reorder the band can't express either — nothing numeric stored on the
   *   page, or fewer integers between `bandMin` and `bandMax` than there are
   *   rows to place: refused, and reported to the caller rather than
   *   approximated. Page 0 is the one exception: NULLs sort last, so if page 0
   *   holds a NULL then no numeric order exists anywhere in the data source,
   *   and if it holds numerics they are the lowest ones there are. Nothing can
   *   sort before page 0, so plain rank is provably safe there.
   *
   * A refusal leaves every known row's order exactly as stored, so the drag is
   * not persisted and nothing the user didn't touch moves. Edits in the same
   * save still commit normally. Ordering a page like that needs the API-side
   * normalisation in #277; this widget cannot invent a safe answer from one
   * page's worth of cached originals.
   *
   * Boundary note: a page whose `bandMin` equals the previous page's last
   * stored order is already ambiguous in the stored state — those two rows
   * separate on `id ASC`, and which sorts first can change across a reorder.
   * That is a one-row ambiguity at the seam, inherent to a non-unique order
   * column, not a page-scale move.
   *
   * @param {Array} entries - Current entries from getData() (mutated in place)
   * @param {Object} originalMap - Map of entry ID -> cached original (order/data), scoped to this page
   * @param {Number} currentPage - 0-based current page index
   * @param {Number} pageSize - Entries per page
   * @param {Boolean} didReorder - a real Handsontable afterRowMove fired this save (spreadsheet.js hasRowsMoved())
   * @returns {Object} { entries, reordered, refused } - `entries` is the same array, for convenience
   */
  function resolveEntryOrder(entries, originalMap, currentPage, pageSize, didReorder) {
    entries = entries || [];
    originalMap = originalMap || {};

    var pageOffset = currentPage * pageSize;

    function originalFor(entry) {
      return typeof entry.id !== 'undefined' ? originalMap[entry.id] : undefined;
    }

    function isDistinct(values) {
      var seen = {};

      return values.every(function(value) {
        if (seen[value]) {
          return false;
        }

        seen[value] = true;

        return true;
      });
    }

    // Leave every known row's stored order alone. A brand-new row has no stored
    // order to keep but still needs a value, so it takes rank + offset — the
    // closest thing to "where the user put it" that this page can express.
    function keepStoredOrder() {
      entries.forEach(function(entry, localIndex) {
        var original = originalFor(entry);

        if (original && typeof original.order !== 'undefined') {
          entry.order = original.order;
        } else {
          entry.order = localIndex + pageOffset;
        }
      });
    }

    if (!didReorder) {
      keepStoredOrder();

      return { entries: entries, reordered: false, refused: false };
    }

    var stored = [];
    var storedNonNumeric = 0;

    entries.forEach(function(entry) {
      var original = originalFor(entry);

      if (!original) {
        return;
      }

      if (typeof original.order === 'number') {
        stored.push(original.order);
      } else {
        storedNonNumeric += 1;
      }
    });

    // First choice: replay the page's own stored orders, sorted ascending, onto
    // the new visual sequence. Every existing row has to hold a distinct number
    // for this — repeats would separate on `id ASC` on reload, which doesn't
    // always match what the user dragged. When it applies it is the best answer
    // available: the page's exact values are reused, so the set of orders in the
    // data source is unchanged, sparse spacing (#277) survives untouched, and
    // only the rows that actually moved end up in the payload.
    if (!storedNonNumeric && stored.length && isDistinct(stored)) {
      var pool = stored.slice().sort(function(a, b) {
        return a - b;
      });
      var poolIndex = 0;
      var previous = null;

      entries.forEach(function(entry) {
        if (originalFor(entry)) {
          entry.order = pool[poolIndex];
          poolIndex += 1;
          previous = entry.order;

          return;
        }

        // A row added in this same save has no pool value to take — the pool
        // holds exactly one value per existing row and all of them are needed.
        // So it takes the value of the row it was dropped after and separates
        // from it on `id ASC`. A row created in this save always has the higher
        // id, so it sorts immediately after that row: exactly where it was
        // dropped. A new row dropped above every existing row on the page is
        // the one position this can't hit — there is no value below the band
        // that is safely clear of the previous page — so it ties with the first
        // row instead and lands just after it.
        entry.order = previous === null ? pool[0] : previous;
      });

      return { entries: entries, reordered: true, refused: false };
    }

    // Otherwise the stored values can't be replayed one-for-one — they repeat,
    // some are NULL, or rows were added in the same save. Pack the page into the
    // low end of the band it already occupies instead: less tidy, and it commits
    // the whole page, but every value still sits inside orders these rows
    // already held, so the page keeps its global slot.
    if (stored.length) {
      var bandMin = Math.min.apply(null, stored);
      var bandMax = Math.max.apply(null, stored);

      // A page that came back holding fewer rows than pageSize is the last page,
      // so nothing in the data source sorts after it and the band can run past
      // bandMax freely. On a full page the next page's orders start just above
      // bandMax, so every row has to fit inside the band as it stands —
      // including rows added in the same save, which need a value too.
      var pageWasFull = Object.keys(originalMap).length >= pageSize;

      if (!pageWasFull || bandMax - bandMin + 1 >= entries.length) {
        entries.forEach(function(entry, localIndex) {
          entry.order = bandMin + localIndex;
        });

        return { entries: entries, reordered: true, refused: false };
      }
    }

    if (currentPage === 0) {
      entries.forEach(function(entry, localIndex) {
        entry.order = localIndex;
      });

      return { entries: entries, reordered: true, refused: false };
    }

    keepStoredOrder();

    return { entries: entries, reordered: false, refused: true };
  }

  /**
   * Decide the pagination-state recovery for a failed page-navigation fetch,
   * without touching the DOM — the actual decision behind onFetchError's
   * recovery, pulled out so it's unit-testable (interface.js can't be
   * executed in Jest: it needs jQuery/Fliplet globals at load time).
   *
   * A real failure means the page that was being navigated to never rendered,
   * so currentPage needs to roll back to the page that's actually on screen.
   * Stale errors never reach here — onFetchError returns for them before any
   * recovery, because a newer fetch already owns currentPage and will update
   * the controls itself.
   *
   * @param {Number} lastRenderedPage - the page actually on screen right now
   * @returns {Object} { currentPage, lastRenderedPage }
   */
  function resolveFetchErrorRecovery(lastRenderedPage) {
    return {
      currentPage: lastRenderedPage,
      lastRenderedPage: lastRenderedPage
    };
  }

  return {
    computePageInfo: computePageInfo,
    computeCommitPayload: computeCommitPayload,
    resolveEntryOrder: resolveEntryOrder,
    resolveFetchErrorRecovery: resolveFetchErrorRecovery
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Pagination;
}
