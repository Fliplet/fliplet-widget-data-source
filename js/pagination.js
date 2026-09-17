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
   * Order comparator with SQL "ORDER BY ... ASC" NULLS LAST semantics —
   * matches how fliplet-api's Postgres query actually sorts a nullable,
   * non-unique `order` column (confirmed: NULL sorts after every number).
   * @param {Number|null|undefined} a - first order value to compare
   * @param {Number|null|undefined} b - second order value to compare
   * @returns {Number} comparator result
   */
  function compareOrderNullsLast(a, b) {
    var aNull = a === null || typeof a === 'undefined';
    var bNull = b === null || typeof b === 'undefined';

    if (aNull && bNull) {
      return 0;
    }

    if (aNull) {
      return 1;
    }

    if (bNull) {
      return -1;
    }

    return a - b;
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
   * This restores each row's own true cached order when nothing on the page
   * actually changed position — verified by comparing the page's current
   * visual sequence against the sequence its cached original orders would
   * produce (NULLS LAST, matching Postgres). Only when that comparison shows
   * a genuine reorder does it touch `order` at all, and even then it only
   * redistributes the page's own existing set of order values across the new
   * sequence — it never invents a value or reaches into another page's range.
   * A brand-new row (no cached original) has no true order to preserve, so it
   * gets a page-correct rank+offset value — the same bounded, pre-existing
   * limitation this widget already had for inserts.
   *
   * @param {Array} entries - Current entries from getData() (mutated in place)
   * @param {Object} originalMap - Map of entry ID -> cached original (order/data), scoped to this page
   * @param {Number} currentPage - 0-based current page index
   * @param {Number} pageSize - Entries per page
   * @returns {Array} The same `entries` array, for convenience
   */
  function resolveEntryOrder(entries, originalMap, currentPage, pageSize) {
    entries = entries || [];
    originalMap = originalMap || {};

    var pageOffset = currentPage * pageSize;
    var known = [];

    entries.forEach(function(entry, localIndex) {
      var original = typeof entry.id !== 'undefined' ? originalMap[entry.id] : undefined;

      if (original && typeof original.order !== 'undefined') {
        known.push({ entry: entry, originalOrder: original.order });
      } else {
        // No cached original — a genuinely new row. Nothing to preserve.
        entry.order = localIndex + pageOffset;
      }
    });

    if (!known.length) {
      return entries;
    }

    // `known` is already in current visual order (entries was iterated in
    // that order). Compare it against the sequence its true original orders
    // would produce — if identical, nothing on this page actually moved.
    var byOriginalOrder = known.slice().sort(function(a, b) {
      return compareOrderNullsLast(a.originalOrder, b.originalOrder);
    });

    var unchanged = known.every(function(item, i) {
      return item === byOriginalOrder[i];
    });

    if (unchanged) {
      known.forEach(function(item) {
        item.entry.order = item.originalOrder;
      });

      return entries;
    }

    // A genuine reorder happened — redistribute the page's own set of order
    // values (sorted) across the new visual sequence. Every value already
    // legitimately belongs to a row on this page; none is invented.
    var orderPool = byOriginalOrder.map(function(item) {
      return item.originalOrder;
    });

    known.forEach(function(item, i) {
      item.entry.order = orderPool[i];
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
    compareOrderNullsLast: compareOrderNullsLast,
    resolveEntryOrder: resolveEntryOrder,
    resolveFetchErrorRecovery: resolveFetchErrorRecovery
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Pagination;
}
