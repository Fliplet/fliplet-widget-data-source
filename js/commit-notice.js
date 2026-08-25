/**
 * Turning what a save declined into something the user can read.
 *
 * Every bounded path in the commit diff answers a position it cannot afford by
 * declining it - the row saves, it just reloads somewhere other than where it
 * was dropped. That is the right trade against a failed save, but it is
 * invisible: the grid accepts the change, the save succeeds, and only the
 * reload disagrees.
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
   * @param {Object} declined - { reorder: Boolean, sorted: Boolean, rows: Number }
   * @returns {String} Message for the user, empty when nothing was declined
   */
  function forDeclined(declined) {
    if (!declined) {
      return '';
    }

    var rows = declined.rows || 0;

    // The sort comes first because it is the only one the user can undo
    // themselves, and because it explains both halves at once: under a sort the
    // grid is not showing the stored sequence, so neither a drag nor a new
    // row's position can be read off it.
    if (declined.sorted && rows) {
      return rows === 1
        ? 'A new row cannot be positioned while a column is sorted, so it has reloaded in the data source\'s own order. Clear the sort to place rows.'
        : rows + ' new rows cannot be positioned while a column is sorted, so they have reloaded in the data source\'s own order. Clear the sort to place rows.';
    }

    if (declined.reorder && rows) {
      return rows === 1
        ? 'The new row order was too large to save on this data source, so rows have reloaded in their previous order — including the row you added, which has moved with them.'
        : 'The new row order was too large to save on this data source, so rows have reloaded in their previous order — including the ' + rows + ' rows you added, which have moved with them.';
    }

    if (declined.reorder) {
      return 'The new row order was too large to save on this data source, so rows have reloaded in their previous order.';
    }

    if (rows === 1) {
      return 'A new row could not be saved in that position on a data source this large, so it has reloaded elsewhere.';
    }

    if (rows > 1) {
      return rows + ' new rows could not be saved in those positions on a data source this large, so they have reloaded elsewhere.';
    }

    return '';
  }

  return {
    forDeclined: forDeclined
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CommitNotice;
}
