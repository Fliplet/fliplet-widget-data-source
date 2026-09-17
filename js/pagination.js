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
   * row's stored order is dense, 0-based, or gapless (PS-2072 / PS-1781).
   *
   * getData() (spreadsheet.js) re-derives every entry's `order` from its
   * plain visual rank within the currently loaded page, with no notion of
   * pagination and no idea whether the row actually moved. Trusting that
   * rank directly — as a page offset alone would — corrupts any data source
   * whose real `order` values aren't already `0..n-1`: a nullable, non-unique
   * integer column that the API both permits and actively produces via SSO
   * provisioning and the public insert endpoint. On such a data source, an
   * ordinary save with zero edits would silently rewrite every row's order.
   *
   * An earlier version of this function tried to detect "did a reorder
   * happen" by comparing the page's current visual sequence against the
   * sequence its cached original orders implied. That inference is blind
   * exactly where those orders tie (duplicates, or — the common case for
   * SSO/API-created data — multiple NULLs): a genuine drag on an all-NULL
   * page read as "nothing changed" and was silently discarded, and
   * redistributing a pool containing ties fell back to `id ASC` on reload,
   * which doesn't always match what the user dragged. Both are symptoms of
   * inferring intent from values instead of asking whether a move actually
   * happened.
   *
   * `didReorder` is the real signal instead — sourced from Handsontable's own
   * `afterRowMove` (see spreadsheet.js's `hasRowsMoved`), not inferred:
   * - No reorder this save: every known row keeps its own true order,
   *   untouched, whatever shape it has. This is what closes the original
   *   Critical — an ordinary save can never rewrite an untouched row's order.
   * - A reorder did happen: every known row on the page gets a fresh
   *   rank+offset value from its new visual position. These are always
   *   pairwise distinct (rank is a plain array index), so there is no tie to
   *   break on reload — the save round-trips exactly as arranged, at the
   *   cost of renumbering the whole page rather than only the rows that
   *   moved (the same trade #276 makes for a de-densified prefix).
   * - A brand-new row (no cached original) has no true order to preserve
   *   either way, so it gets the same page-correct rank+offset value.
   *
   * @param {Array} entries - Current entries from getData() (mutated in place)
   * @param {Object} originalMap - Map of entry ID -> cached original (order/data), scoped to this page
   * @param {Number} currentPage - 0-based current page index
   * @param {Number} pageSize - Entries per page
   * @param {Boolean} didReorder - a real Handsontable afterRowMove fired this save (spreadsheet.js hasRowsMoved())
   * @returns {Array} The same `entries` array, for convenience
   */
  function resolveEntryOrder(entries, originalMap, currentPage, pageSize, didReorder) {
    entries = entries || [];
    originalMap = originalMap || {};

    var pageOffset = currentPage * pageSize;

    entries.forEach(function(entry, localIndex) {
      var original = typeof entry.id !== 'undefined' ? originalMap[entry.id] : undefined;
      var hasKnownOrder = original && typeof original.order !== 'undefined';

      if (hasKnownOrder && !didReorder) {
        entry.order = original.order;
      } else {
        entry.order = localIndex + pageOffset;
      }
    });

    return entries;
  }

  /**
   * Decide the pagination-state recovery for a failed page-navigation fetch,
   * without touching the DOM — the actual decision behind onFetchError's
   * recovery, pulled out so it's unit-testable (interface.js can't be
   * executed in Jest: it needs jQuery/Fliplet globals at load time).
   *
   * A stale error (superseded by a newer, still-in-flight or already-resolved
   * fetch) must not recover anything — that newer fetch owns currentPage and
   * will update controls itself; touching state here would race it. A real
   * failure means the page that was being navigated to never rendered, so
   * currentPage needs to roll back to the page that's actually on screen.
   *
   * @param {Boolean} stale - a newer fetch superseded this one
   * @param {Number} lastRenderedPage - the page actually on screen right now
   * @returns {Object} { shouldRecover, currentPage, lastRenderedPage }
   */
  function resolveFetchErrorRecovery(stale, lastRenderedPage) {
    if (stale) {
      return { shouldRecover: false };
    }

    return {
      shouldRecover: true,
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
