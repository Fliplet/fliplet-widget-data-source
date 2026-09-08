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
   * @param {Object} declined - { sorted: Boolean, rows: Number }
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

    // The sort comes first because it is the only one the user can undo
    // themselves. Under a sort the grid is not showing the stored sequence, so
    // a new row's position cannot be read off it - the API can make room for
    // the row, but nothing can tell it where the user meant it to go.
    if (declined.sorted) {
      return rows === 1
        ? 'A new row cannot be positioned while a column is sorted, so it has reloaded in the data source\'s own order. Clear the sort to place rows.'
        : rows + ' new rows cannot be positioned while a column is sorted, so they have reloaded in the data source\'s own order. Clear the sort to place rows.';
    }

    // All that is left: the row order column has reached the end of its range.
    // Row order is stored as a 32-bit integer, so there is no value left to
    // give the row, and writing one anyway would fail the save outright.
    return rows === 1
      ? 'A new row could not be given a position because this data source has run out of row order values, so it has reloaded at the end.'
      : rows + ' new rows could not be given a position because this data source has run out of row order values, so they have reloaded at the end.';
  }

  return {
    forDeclined: forDeclined
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CommitNotice;
}
