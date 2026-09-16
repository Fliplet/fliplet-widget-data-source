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
   * Convert page-local order indexes into their true position in the data
   * source's global order space.
   *
   * The grid (spreadsheet.js getData()) assigns entry.order from a row's
   * visual position within whatever page is currently loaded — it has no
   * notion of pagination, so it always starts counting from 0. Saving page
   * 2+ as-is collides with page 1's 0..pageSize-1 order range and corrupts
   * the data source's row order (PS-20272). This offsets order by the page's
   * start index so it lands in the correct global range instead.
   *
   * Reordering within a page (drag-to-reorder) still produces a correct,
   * contiguous order range for that page once offset — pages can't be
   * cross-dragged since only one page of rows is ever loaded in the grid.
   *
   * @param {Array} entries - Entries with a page-local `order` field (mutated in place)
   * @param {Number} currentPage - 0-based current page index
   * @param {Number} pageSize - Entries per page
   * @returns {Array} The same `entries` array, for convenience
   */
  function applyPageOrderOffset(entries, currentPage, pageSize) {
    var offset = currentPage * pageSize;

    if (!offset || !entries) {
      return entries;
    }

    entries.forEach(function(entry) {
      if (typeof entry.order === 'number') {
        entry.order += offset;
      }
    });

    return entries;
  }

  return {
    computePageInfo: computePageInfo,
    computeCommitPayload: computeCommitPayload,
    applyPageOrderOffset: applyPageOrderOffset
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Pagination;
}
