/**
 * Spotting new rows that are exact copies of other rows in the same save.
 *
 * A fill-handle drag or a paste into the spare rows produces rows without an
 * id whose data matches rows already in the grid. Saving them inserts silent
 * duplicates. This module finds them so the save can ask before committing.
 *
 * In its own module so the matching is executed by the specs.
 */

// eslint-disable-next-line no-unused-vars
var DuplicateRows = (function() {
  'use strict';

  // The entry-diff module is a global in the browser bundle and a CommonJS
  // module in the specs
  var entryDiff = typeof EntryDiff !== 'undefined'
    ? EntryDiff // eslint-disable-line no-undef
    : require('./entry-diff');

  // Grid row of the first data row (row 1 is the column headers)
  var FIRST_DATA_ROW = 2;

  // Most row numbers listed in the confirmation message
  var MAX_LISTED_ROWS = 10;

  /**
   * Comparable key for an entry's data. normalizeData() already returns a
   * flat map of strings (objects stable-stringified), so sorting the keys is
   * enough to make key order irrelevant.
   * @param {Object} data - Entry data
   * @returns {String|null} Key, or null when the data is empty
   */
  function dataKey(data) {
    var normalized = entryDiff.normalizeData(data);
    var keys = Object.keys(normalized);

    if (!keys.length) {
      return null;
    }

    return JSON.stringify(keys.sort().map(function(key) {
      return [key, normalized[key]];
    }));
  }

  /**
   * Whether a grid row has a value. Same rule the spreadsheet uses to drop
   * empty rows from getData({ removeEmptyRows: true }).
   * @param {Array} row - Grid row
   * @returns {Boolean} True when at least one cell has a value
   */
  function isNotEmpty(row) {
    return (row || []).some(function(field) {
      return [null, undefined, ''].indexOf(field) === -1;
    });
  }

  /**
   * Grid row numbers of the non-empty data rows, in visual order. These line
   * up one-to-one with getData({ removeEmptyRows: true }).
   * @param {Array} visualRows - Visual grid data rows, without the header row
   * @returns {Array} 1-based grid row numbers
   */
  function gridRowNumbers(visualRows) {
    var rows = [];

    (visualRows || []).forEach(function(row, index) {
      if (isNotEmpty(row)) {
        rows.push(index + FIRST_DATA_ROW);
      }
    });

    return rows;
  }

  /**
   * Find new rows whose data exactly matches another row in the same save
   * @param {Array} entries - Entries in visual order ([{ id, data }])
   * @param {Array} [gridRows] - Grid row number of each entry. When omitted,
   *   entries are taken to be every data row (index + 2). When given but not
   *   one per entry, the positions are unknown and no rows are reported.
   * @returns {Object} { count, rows } where rows are 1-based grid row numbers
   */
  function find(entries, gridRows) {
    var counts = {};
    var keys = [];
    var rows = [];
    var count = 0;

    entries = entries || [];

    var rowsKnown = !gridRows || gridRows.length === entries.length;

    entries.forEach(function(entry, index) {
      var key = dataKey(entry && entry.data);

      keys[index] = key;

      if (key !== null) {
        counts[key] = (counts[key] || 0) + 1;
      }
    });

    entries.forEach(function(entry, index) {
      var key = keys[index];

      if (key === null || (entry && entry.id) || counts[key] < 2) {
        return;
      }

      count++;

      if (rowsKnown) {
        rows.push(gridRows ? gridRows[index] : index + FIRST_DATA_ROW);
      }
    });

    return {
      count: count,
      rows: rows
    };
  }

  /**
   * Confirmation message for a find() result
   * @param {Object} result - { count, rows } from find()
   * @returns {String} Message asking whether to save the copies
   */
  function message(result) {
    var single = result.count === 1;
    var rows = result.rows || [];
    var text = result.count + ' new ' + (single ? 'row is an exact copy' : 'rows are exact copies') + ' of other rows';

    if (rows.length) {
      text += ' (' + (rows.length === 1 ? 'row ' : 'rows ')
        + rows.slice(0, MAX_LISTED_ROWS).join(', ')
        + (rows.length > MAX_LISTED_ROWS ? ', …' : '') + ')';
    }

    return text + '. Save ' + (single ? 'it' : 'them') + ' anyway?';
  }

  return {
    find: find,
    gridRowNumbers: gridRowNumbers,
    message: message
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DuplicateRows;
}
