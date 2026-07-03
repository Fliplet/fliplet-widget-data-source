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
   * Normalise a single cell value for change-detection.
   * The spreadsheet round-trips every value through a text grid (getData +
   * parseCellValue), so a number stored as 30 comes back as the string "30",
   * and a blank cell comes back as "" — comparing the raw values would flag
   * those as changes even though the user changed nothing. We coerce scalars
   * to their string form and treat null/undefined/"" alike as "blank".
   * @param {*} value - Raw cell value
   * @returns {String} Canonical string form ("" for blanks)
   */
  function normalizeValue(value) {
    if (value === null || typeof value === 'undefined') {
      return '';
    }

    // Arrays/objects: compare structurally via a stable serialisation
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Build a canonical, comparable representation of an entry's data.
   * Blank fields are dropped so an empty cell and an absent column compare
   * equal, and keys are sorted so key order never affects the comparison.
   * @param {Object} data - Entry data object
   * @returns {Object} Normalised data map
   */
  function normalizeData(data) {
    var normalized = {};

    Object.keys(data || {}).sort().forEach(function(key) {
      var value = normalizeValue(data[key]);

      if (value !== '') {
        normalized[key] = value;
      }
    });

    return normalized;
  }

  /**
   * Determine whether a table entry differs from its cached original.
   * A row counts as changed when its data content changed OR its position
   * (order) changed — mirroring what the /commit endpoint actually persists
   * (it only rewrites order when entry.order !== existing.order).
   * Comparing the whole entry object (the previous behaviour) produced false
   * positives because getData() re-derives `order` as the visual row index and
   * re-parses cell types, so unchanged rows never compared equal and every row
   * was re-sent on every save (PR-9).
   * @param {Object} entry - Current entry from the table
   * @param {Object} original - Cached original entry
   * @param {Function} isEqualFn - Deep equality comparison function
   * @returns {Boolean} True if the entry should be committed
   */
  function hasEntryChanged(entry, original, isEqualFn) {
    if (!isEqualFn(normalizeData(entry.data), normalizeData(original.data))) {
      return true;
    }

    // Position change (reorder). Guard on a defined order to mirror the API,
    // which only updates order when a value is supplied.
    return typeof entry.order !== 'undefined' && entry.order !== original.order;
  }

  /**
   * Compute the commit payload by comparing current entries against original cached entries.
   * Separates entries into inserted, updated, and deleted.
   * NOTE: Mutates entries in place — adds clientId to new entries, deletes id from recovered entries.
   * @param {Array} entries - Current entries from the table
   * @param {Object} originalMap - Map of entry ID → original entry (from cacheOriginalEntries)
   * @param {Function} isEqualFn - Deep equality comparison function (e.g. _.isEqual), applied to normalised data
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

      if (hasEntryChanged(entry, original, isEqualFn)) {
        updated.push(entry);
      }
    });

    return {
      entries: updated.concat(inserted),
      delete: deleted
    };
  }

  return {
    computePageInfo: computePageInfo,
    computeCommitPayload: computeCommitPayload
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Pagination;
}
