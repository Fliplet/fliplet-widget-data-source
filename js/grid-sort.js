/**
 * Reading Handsontable's column-sort state.
 *
 * One predicate, in its own module so it can be tested without a DOM - the
 * widget's spreadsheet module cannot be loaded outside the browser, and this
 * decision is too easy to get wrong to leave unexecuted by the specs.
 */

// eslint-disable-next-line no-unused-vars
var GridSort = (function() {
  'use strict';

  /**
   * Whether the grid is currently showing a column sort rather than the order
   * the rows are stored in.
   *
   * The plugin's own `isSorted()` cannot answer this. In the Handsontable
   * versions the platform ships - 0.34.5 and 0.38.0 - it reads
   * `undefined !== hot.sortColumn`, and `sortColumn` is only ever cleared by
   * `setSortingColumn(undefined)`, which the header-click path never calls: it
   * always passes a column index. Clicking a header three times walks
   * `sortOrder` through ascending, descending and back to no sort, leaving
   * `sortColumn` set - so `isSorted()` means "a header has been clicked at some
   * point", and would report a sort over a grid that is visibly back in its
   * stored sequence.
   *
   * `sortOrder` is what the plugin's own `sort()` tests, and it is `false` for
   * descending - so this has to check for undefined rather than for
   * truthiness, or every descending sort would read as no sort at all.
   * @param {Object} hot - Handsontable instance
   * @returns {Boolean} True when a sort is applied right now
   */
  function isSortApplied(hot) {
    if (!hot) {
      return false;
    }

    return typeof hot.sortOrder !== 'undefined' && hot.sortOrder !== null;
  }

  return {
    isSortApplied: isSortApplied
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GridSort;
}
