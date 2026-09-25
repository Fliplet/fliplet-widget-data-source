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
   * Decide the pagination-state recovery for a failed page-navigation fetch,
   * without touching the DOM — the actual decision behind onFetchError's
   * recovery, pulled out so it's unit-testable (interface.js can't be
   * executed in a unit test: it needs jQuery/Fliplet globals at load time).
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
    resolveFetchErrorRecovery: resolveFetchErrorRecovery
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Pagination;
}
