/**
 * Turning what a save declined into something the user can read.
 *
 * A declined position fails quietly by design - the row saves, it just reloads
 * somewhere other than where it was dropped. That is the right trade against a
 * failed save, but it is invisible: the grid accepts the change, the save
 * succeeds, and only the reload disagrees.
 *
 * In its own module so the wording is executed by the specs. The same decision
 * lived in interface.js, where nothing could reach it, and the one case it got
 * wrong - a row added while a column is sorted - was reported by review rather
 * than by a test.
 */

// eslint-disable-next-line no-unused-vars
var CommitNotice = (function() {
  'use strict';

  /**
   * Describe what a save could not persist.
   * @param {Object} declined - { sorted: Boolean, searched: Boolean, rows: Number }
   * @returns {String} Message for the user, empty when nothing was declined
   */
  function forDeclined(declined) {
    if (!declined) {
      return '';
    }

    var rows = declined.rows || 0;

    if (!rows) {
      return '';
    }

    // PS-2313: a search shows rows from all over the data source, so no row
    // around a new one says where it belongs. Clearing the search is the fix.
    if (declined.searched) {
      return rows === 1
        ? 'A new row cannot be positioned while search results are shown, so it has been added at the end. Clear the search to place rows.'
        : rows + ' new rows cannot be positioned while search results are shown, so they have been added at the end. Clear the search to place rows.';
    }

    // The sort comes first because it is the only one the user can undo
    // themselves. Under a sort the grid is not showing the stored sequence, so
    // a new row's position cannot be read off it - the API can make room for
    // the row, but nothing can tell it where the user meant it to go.
    if (declined.sorted) {
      return rows === 1
        ? 'A new row cannot be positioned while a column is sorted, so it has reloaded in the data source\'s own order. Clear the sort to place rows.'
        : rows + ' new rows cannot be positioned while a column is sorted, so they have reloaded in the data source\'s own order. Clear the sort to place rows.';
    }

    // More than one thing reaches here - the row order column running out of
    // 32-bit range is the common one, but it is not the only one, and the
    // reasons are not told apart yet. Name the outcome, not a cause we cannot
    // prove, so the message is never actively wrong (#281 review).
    return rows === 1
      ? 'A new row could not be positioned, so it has reloaded at the end.'
      : rows + ' new rows could not be positioned, so they have reloaded at the end.';
  }

  return {
    forDeclined: forDeclined
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CommitNotice;
}
