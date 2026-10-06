var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ColumnChanges = require('../js/column-changes');

// PS-2204: two grid actions changed column names that the save then sent to
// the API, which applies them to every row in the data source.
// - "Insert row before" or "Delete row" with the column names row selected made
//   an entry, or an empty row, the column names row.
// - After a column drag, a new column's name was written onto another column,
//   and the columns showed in the wrong order.

var spreadsheetSource = fs.readFileSync(path.join(__dirname, '../js/spreadsheet.js'), 'utf8');

// Cuts the function that starts at `marker` out of the source by brace-counting,
// as spreadsheet.js needs Handsontable, jQuery and Fliplet and can't be required
function extractFunction(source, marker) {
  var startIndex = source.indexOf(marker);

  if (startIndex === -1) {
    throw new Error('Could not find ' + marker + ' in source');
  }

  startIndex = source.indexOf('function', startIndex);

  var depth = 0;

  for (var i = source.indexOf('{', startIndex); i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
    } else if (source[i] === '}') {
      depth--;

      if (depth === 0) {
        return source.slice(startIndex, i + 1);
      }
    }
  }

  throw new Error('Could not find the end of ' + marker);
}

/**
 * The grid's row and column hooks and generateColumnName from spreadsheet.js,
 * on a grid that does what Handsontable 0.38 does (checked against the real
 * library in jsdom):
 * - The data arrays hold columns in their own (physical) order; a column drag
 *   only changes which physical column shows at each place on screen.
 * - alter('insert_col', index) splices the new column into the data arrays at
 *   `index` as given, then runs afterCreateCol, and only then does the column
 *   move plugin put it on screen at `index`. An updateSettings call inside
 *   afterCreateCol restarts that plugin, which then skips placing the column.
 * - alter('insert_row' / 'remove_row') is cancelled when beforeCreateRow /
 *   beforeRemoveRow returns false.
 * @param {Array} headers Column names
 * @param {Array} rows Data of each row
 * @returns {Object} The grid, its column tracker, the notices shown, and helpers
 */
function createGrid(headers, rows) {
  var data = [headers.slice()].concat(rows.map(function(row) {
    return headers.map(function(header) {
      return row[header];
    });
  }));
  // Physical column shown at each place on screen
  var shown = headers.map(function(header, index) {
    return index;
  });
  var inInsert = false;
  var pluginRestarted = false;
  var notices = [];
  var hooks;

  var hot = {
    getSourceDataAtRow: function(row) {
      return data[row];
    },
    getDataAtRow: function(row) {
      return shown.map(function(physical) {
        return data[row][physical];
      });
    },
    toVisualColumn: function(physical) {
      return shown.indexOf(physical);
    },
    toPhysicalColumn: function(visual) {
      return shown[visual];
    },
    setDataAtCell: function(row, visual, value) {
      data[row][shown[visual]] = value;
    },
    updateSettings: function() {
      if (inInsert) {
        pluginRestarted = true;
      }
    },
    // Drags the column shown at `from` to just before the one shown at `to`
    moveColumn: function(from, to) {
      var physical = shown.splice(from, 1)[0];

      shown.splice(to > from ? to - 1 : to, 0, physical);
    },
    alter: function(action, index, amount, source) {
      var i;

      if (action === 'insert_row') {
        if (hooks.beforeCreateRow(index, amount, source) === false) {
          return;
        }

        for (i = 0; i < amount; i++) {
          data.splice(index, 0, data[0].map(function() {
            return null;
          }));
        }

        return;
      }

      if (action === 'remove_row') {
        if (hooks.beforeRemoveRow(index, amount, [], source) === false) {
          return;
        }

        data.splice(index, amount);

        return;
      }

      if (action === 'insert_col') {
        inInsert = true;
        pluginRestarted = false;

        data.forEach(function(row) {
          for (i = 0; i < amount; i++) {
            row.splice(index, 0, null);
          }
        });

        hooks.afterCreateCol(index, amount, source);

        if (!pluginRestarted) {
          shown = shown.map(function(physical) {
            return physical >= index ? physical + amount : physical;
          });

          for (i = 0; i < amount; i++) {
            shown.splice(index + i, 0, index + i);
          }
        }

        inInsert = false;
      }
    }
  };

  var context = {
    hot: hot,
    columnTracker: ColumnChanges.createTracker(headers),
    colWidths: headers.map(function() {
      return 250;
    }),
    columnNameCounter: 1,
    isDestroyed: false,
    onChange: function() {},
    showGridNotice: function(message) {
      notices.push(message);
    },
    getColumns: function() {
      return hot.getDataAtRow(0);
    },
    Promise: Promise
  };

  vm.createContext(context);
  vm.runInContext([
    extractFunction(spreadsheetSource, 'function generateColumnName('),
    'var hooks = {',
    '  beforeCreateRow: ' + extractFunction(spreadsheetSource, 'beforeCreateRow: function') + ',',
    '  beforeRemoveRow: ' + extractFunction(spreadsheetSource, 'beforeRemoveRow: function') + ',',
    '  afterCreateCol: ' + extractFunction(spreadsheetSource, 'afterCreateCol: function'),
    '};'
  ].join('\n'), context);

  hooks = context.hooks;

  return {
    hot: hot,
    notices: notices,
    context: context,
    // What the save sends for the columns, from the headers in physical order
    // as spreadsheet.js getColumnChanges reads them
    columnChanges: function() {
      var changes = context.columnTracker.getChanges(data[0].slice());

      return { renameColumns: changes.renameColumns, deleteColumns: changes.deleteColumns };
    },
    // Each column as shown, from its name down: "name|value|value"
    shownColumns: function() {
      return shown.map(function(physical) {
        return data.map(function(row) {
          return row[physical] === undefined || row[physical] === null ? '' : row[physical];
        }).join('|');
      });
    },
    rowCount: function() {
      return data.length;
    }
  };
}

var headers = ['A', 'B', 'C'];
var rows = [
  { A: 'a1', B: 'b1', C: 'c1' },
  { A: 'a2', B: 'b2', C: 'c2' }
];
var noColumnChanges = { renameColumns: [], deleteColumns: [] };

describe('column names row (PS-2204)', function() {
  it('refuses "Insert row before" with the column names row selected', function() {
    var grid = createGrid(headers, rows);

    // The toolbar inserts above the selection's last row: the column names row
    grid.hot.alter('insert_row', 0, 1, 'Toolbar.rowBefore');

    expect(grid.shownColumns()).toEqual(['A|a1|a2', 'B|b1|b2', 'C|c1|c2']);
    expect(grid.columnChanges()).toEqual(noColumnChanges);
    expect(grid.notices).toHaveLength(1);
  });

  it('refuses "Delete row" with the column names row selected', function() {
    var grid = createGrid(headers, rows);

    grid.hot.alter('remove_row', 0, 1, 'Toolbar.removeRow');

    expect(grid.shownColumns()).toEqual(['A|a1|a2', 'B|b1|b2', 'C|c1|c2']);
    expect(grid.columnChanges()).toEqual(noColumnChanges);
    expect(grid.notices).toHaveLength(1);
  });

  it('refuses "Delete row" on a selection from the column names row into the entries', function() {
    var grid = createGrid(headers, rows);

    grid.hot.alter('remove_row', 0, 2, 'Toolbar.removeRow');

    expect(grid.shownColumns()).toEqual(['A|a1|a2', 'B|b1|b2', 'C|c1|c2']);
    expect(grid.columnChanges()).toEqual(noColumnChanges);
  });

  it('still inserts and deletes entry rows', function() {
    var grid = createGrid(headers, rows);

    // "Insert row after" on the column names row, then "Delete row" on the second entry
    grid.hot.alter('insert_row', 1, 1, 'Toolbar.rowAfter');
    grid.hot.alter('remove_row', 3, 1, 'Toolbar.removeRow');

    expect(grid.shownColumns()).toEqual(['A||a1', 'B||b1', 'C||c1']);
    expect(grid.rowCount()).toBe(3);
    expect(grid.columnChanges()).toEqual(noColumnChanges);
    expect(grid.notices).toHaveLength(0);
  });
});

describe('a column added after a column drag (PS-2204)', function() {
  function settle() {
    return new Promise(function(resolve) {
      setTimeout(resolve, 0);
    });
  }

  it('names the new column, not the column shown where it was added', function() {
    var grid = createGrid(headers, rows);

    // Drag C to the front, then "Insert column before" on A
    grid.hot.moveColumn(2, 0);
    grid.hot.alter('insert_col', 1, 1, 'Toolbar.columnLeft');

    return settle().then(function() {
      expect(grid.shownColumns()).toEqual(['C|c1|c2', 'Column (1)||', 'A|a1|a2', 'B|b1|b2']);
      expect(grid.columnChanges()).toEqual(noColumnChanges);
      // The new column's width goes where it shows
      expect(grid.context.colWidths).toEqual([250, 50, 250, 250]);
    });
  });

  it('names the new column when the dragged column is the one moved past it', function() {
    var grid = createGrid(headers, rows);

    // Drag A to the end, then "Insert column before" on B, now the first column
    grid.hot.moveColumn(0, 3);
    grid.hot.alter('insert_col', 0, 1, 'Toolbar.columnLeft');

    return settle().then(function() {
      expect(grid.shownColumns()).toEqual(['Column (1)||', 'B|b1|b2', 'C|c1|c2', 'A|a1|a2']);
      expect(grid.columnChanges()).toEqual(noColumnChanges);
    });
  });

  it('names a column added without a drag, as before', function() {
    var grid = createGrid(headers, rows);

    grid.hot.alter('insert_col', 3, 1, 'Toolbar.columnRight');

    return settle().then(function() {
      expect(grid.shownColumns()).toEqual(['A|a1|a2', 'B|b1|b2', 'C|c1|c2', 'Column (1)||']);
      expect(grid.columnChanges()).toEqual(noColumnChanges);
      expect(grid.context.colWidths).toEqual([250, 250, 250, 50]);
    });
  });

  it('leaves a spare column Handsontable adds unnamed', function() {
    var grid = createGrid(headers, rows);

    grid.hot.alter('insert_col', 3, 1, 'auto');

    return settle().then(function() {
      expect(grid.shownColumns()).toEqual(['A|a1|a2', 'B|b1|b2', 'C|c1|c2', '||']);
    });
  });
});
