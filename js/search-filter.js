/**
 * Server-side search for paginated data sources (PS-2313).
 * Pure functions: no DOM, no API, no Fliplet globals.
 */

// eslint-disable-next-line no-unused-vars
var SearchFilter = (function() {
  'use strict';

  /**
   * The query `where` matching a term in any column. sift's `$iLike` is a
   * case-insensitive substring match, so the term is sent bare (no `%`).
   * @param {Array} columns - Column names
   * @param {String} term - Text typed in the Find box
   * @returns {Object|null} `{ $or: [...] }`, or null when there is nothing to match
   */
  function buildWhere(columns, term) {
    term = (term || '').trim();

    if (!term) {
      return null;
    }

    var conditions = (columns || []).filter(function(column) {
      return typeof column === 'string' && column && column.charAt(0) !== '$';
    }).map(function(column) {
      var condition = {};

      condition[column] = { $iLike: term };

      return condition;
    });

    return conditions.length ? { $or: conditions } : null;
  }

  /**
   * Whether the Find box searches server-side: a term, and more rows than fit
   * in the grid. Smaller data sources keep the client-side search.
   * @param {String} term - Text typed in the Find box
   * @param {Number} totalEntries - Rows in the data source
   * @param {Number} pageSize - Rows per page
   * @returns {Boolean} True in filter mode
   */
  function isActive(term, totalEntries, pageSize) {
    return !!(term || '').trim() && totalEntries > pageSize;
  }

  /**
   * The pagination bar text while filtered
   * @param {Object} pageInfo - From Pagination.computePageInfo over the match count
   * @param {String} term - The active term
   * @returns {String} e.g. `1–37 of 37 entries matching "smith"`
   */
  function rangeText(pageInfo, term) {
    return pageInfo.startEntry + '–' + pageInfo.endEntry + ' of ' + pageInfo.totalEntries
      + ' entries matching "' + term + '"';
  }

  return {
    buildWhere: buildWhere,
    isActive: isActive,
    rangeText: rangeText
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SearchFilter;
}
