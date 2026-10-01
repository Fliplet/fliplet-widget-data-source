var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var ColumnChanges = require('../js/column-changes');

// PS-2204: on a data source bigger than one page, renaming or deleting a column
// in the grid changed the rows on that page only. The save now sends the
// renames and deletions, and the API applies them to every row.

// The API's commit, as far as columns go (fliplet-api routes/v1/data-sources.js):
// updateColumnNamesAndData runs on every row first - deletes, then renames, in
// the order sent - then the entries sent replace their rows' data, and the
// column list becomes the one sent plus any key of an entry sent.
function applyCommit(ds, body) {
  var deletes = body.deleteColumns || [];
  var renames = body.renameColumns || [];

  if (deletes.length || renames.length) {
    ds.rows.forEach(function(row) {
      var data = Object.assign({}, row.data);

      deletes.forEach(function(column) {
        delete data[column];
      });

      renames.forEach(function(rename) {
        if (Object.prototype.hasOwnProperty.call(data, rename.column)) {
          data[rename.newColumn] = data[rename.column];
          delete data[rename.column];
        }
      });

      row.data = data;
    });
  }

  (body.entries || []).forEach(function(entry) {
    ds.rows.forEach(function(row) {
      if (row.id === entry.id) {
        row.data = entry.data;
      }
    });
  });

  var columns = body.columns.slice();

  (body.entries || []).forEach(function(entry) {
    Object.keys(entry.data).forEach(function(key) {
      if (columns.indexOf(key) === -1) {
        columns.push(key);
      }
    });
  });

  ds.columns = columns;
}

// Columns the manager shows for a page: the saved list plus every key found on
// the page's rows (fetchCurrentDataSourceEntries)
function pageColumns(ds, page, pageSize) {
  var columns = ds.columns.slice();

  ds.rows.slice(page * pageSize, (page + 1) * pageSize).forEach(function(row) {
    Object.keys(row.data).forEach(function(key) {
      if (columns.indexOf(key) === -1) {
        columns.push(key);
      }
    });
  });

  return columns;
}

function makeDataSource(count) {
  var rows = [];
  var i;

  for (i = 1; i <= count; i++) {
    rows.push({ id: i, data: { Name: 'Name ' + i, Email: 'user' + i + '@example.com', Notes: 'note ' + i } });
  }

  return { columns: ['Name', 'Email', 'Notes'], rows: rows };
}

// Row data for one page as the grid's getData() builds it: keyed by the header
// row, a column without a header left out
function gridRows(ds, page, pageSize, savedNames, gridNames) {
  return ds.rows.slice(page * pageSize, (page + 1) * pageSize).map(function(row) {
    var data = {};

    savedNames.forEach(function(saved, index) {
      var name = gridNames[index];

      if (name && Object.prototype.hasOwnProperty.call(row.data, saved)) {
        data[name] = row.data[saved];
      }
    });

    return { id: row.id, data: data };
  });
}

describe('ColumnChanges - what a save sends', function() {
  it('sends nothing when no column was renamed or deleted', function() {
    var tracker = ColumnChanges.createTracker(['Name', 'Email']);
    var changes = tracker.getChanges(['Name', 'Email']);

    expect(changes.renameColumns).toEqual([]);
    expect(changes.deleteColumns).toEqual([]);
  });

  it('a renamed header is sent as a rename', function() {
    var tracker = ColumnChanges.createTracker(['Name', 'Email']);
    var changes = tracker.getChanges(['Name', 'Work email']);

    expect(changes.renameColumns).toEqual([{ column: 'Email', newColumn: 'Work email' }]);
    expect(changes.deleteColumns).toEqual([]);
  });

  it('a removed column is sent as a deletion', function() {
    var tracker = ColumnChanges.createTracker(['Name', 'Email', 'Notes']);

    tracker.remove([1]);

    var changes = tracker.getChanges(['Name', 'Notes']);

    expect(changes.deleteColumns).toEqual(['Email']);
    expect(changes.renameColumns).toEqual([]);
  });

  it('removing B and renaming A to B deletes B and renames A, which the header row alone cannot tell', function() {
    var tracker = ColumnChanges.createTracker(['A', 'B']);

    tracker.remove([1]);

    var changes = tracker.getChanges(['B']);

    expect(changes.deleteColumns).toEqual(['B']);
    expect(changes.renameColumns).toEqual([{ column: 'A', newColumn: 'B' }]);
  });

  it('a new column is not a rename, whatever it is called', function() {
    var tracker = ColumnChanges.createTracker(['Name', 'Email']);

    tracker.insert(1, 1);

    var changes = tracker.getChanges(['Name', 'Phone', 'Email']);

    expect(changes.renameColumns).toEqual([]);
    expect(changes.deleteColumns).toEqual([]);
  });

  it('the grid\'s spare columns, which have no header, are never sent', function() {
    var tracker = ColumnChanges.createTracker(['Name', 'Email']);

    // Handsontable appends spare columns while it builds the grid
    tracker.insert(2, 10);

    var changes = tracker.getChanges(['Name', 'Email'].concat(new Array(10).fill(null)));

    expect(changes.renameColumns).toEqual([]);
    expect(changes.deleteColumns).toEqual([]);
  });

  it('a column whose header was emptied is deleted, as its values are no longer saved anywhere', function() {
    var tracker = ColumnChanges.createTracker(['Name', 'Email']);
    var changes = tracker.getChanges(['Name', null]);

    expect(changes.deleteColumns).toEqual(['Email']);
  });

  it('a rename after columns were inserted and removed is matched to the right column', function() {
    var tracker = ColumnChanges.createTracker(['A', 'B', 'C', 'D']);

    tracker.insert(0, 2); // two new columns at the front
    tracker.remove([3]); // B, now at physical index 3

    var changes = tracker.getChanges(['New 1', 'New 2', 'A', 'C renamed', 'D']);

    expect(changes.deleteColumns).toEqual(['B']);
    expect(changes.renameColumns).toEqual([{ column: 'C', newColumn: 'C renamed' }]);
  });

  it('sends nothing beyond the page when two columns share a name', function() {
    var tracker = ColumnChanges.createTracker(['A', 'B']);
    var changes = tracker.getChanges(['X', 'X']);

    expect(changes.renameColumns).toEqual([]);
    expect(changes.deleteColumns).toEqual([]);
  });

  it('does not delete a saved column it only lost track of', function() {
    var tracker = ColumnChanges.createTracker(['A', 'B', 'C']);

    // The grid reports fewer columns than the tracker has ids for: the ids past
    // the end are not columns the user removed
    var changes = tracker.getChanges(['A', 'B']);

    expect(changes.deleteColumns).toEqual([]);
  });
});

describe('ColumnChanges - renames are ordered so applying them one by one is safe', function() {
  it('A to B and B to C: B is renamed away first', function() {
    var tracker = ColumnChanges.createTracker(['A', 'B']);
    var changes = tracker.getChanges(['B', 'C']);

    expect(changes.renameColumns).toEqual([
      { column: 'B', newColumn: 'C' },
      { column: 'A', newColumn: 'B' }
    ]);
  });

  it('a swap goes through a temporary name', function() {
    var tracker = ColumnChanges.createTracker(['A', 'B']);
    var changes = tracker.getChanges(['B', 'A']);
    var temp = ColumnChanges.TEMP_NAME_PREFIX + '1';

    expect(changes.renameColumns).toEqual([
      { column: 'A', newColumn: temp },
      { column: 'B', newColumn: 'A' },
      { column: temp, newColumn: 'B' }
    ]);
  });

  it('the temporary name never takes a name already in use', function() {
    var used = ColumnChanges.TEMP_NAME_PREFIX + '1';
    var ordered = ColumnChanges.orderRenames([
      { column: 'A', newColumn: 'B' },
      { column: 'B', newColumn: 'A' }
    ], ['A', 'B', used]);

    expect(ordered[0].newColumn).toBe(ColumnChanges.TEMP_NAME_PREFIX + '2');
  });

  it('every row ends up right for chains, swaps and a three-way rotation', function() {
    var cases = [
      [['A', 'B', 'C'], ['B', 'C', 'D']],
      [['A', 'B'], ['B', 'A']],
      [['A', 'B', 'C'], ['B', 'C', 'A']],
      [['A', 'B', 'C', 'D'], ['B', 'A', 'D', 'C']]
    ];

    cases.forEach(function(testCase) {
      var saved = testCase[0];
      var current = testCase[1];
      var tracker = ColumnChanges.createTracker(saved);
      var changes = tracker.getChanges(current);
      var row = {};
      var expected = {};

      saved.forEach(function(name, index) {
        row[name] = 'value of ' + name;
        expected[current[index]] = 'value of ' + name;
      });

      var ds = { columns: saved, rows: [{ id: 1, data: row }] };

      applyCommit(ds, { entries: [], columns: current, renameColumns: changes.renameColumns, deleteColumns: [] });

      expect(ds.rows[0].data).toEqual(expected);
    });
  });
});

describe('ColumnChanges - undo, redo and saves', function() {
  it('undoing a column removal puts the ids back, so nothing is deleted or renamed', function() {
    var tracker = ColumnChanges.createTracker(['A', 'B', 'C']);
    var before = tracker.getIds();

    tracker.remove([1]);
    tracker.restore(before);

    var changes = tracker.getChanges(['A', 'B', 'C']);

    expect(changes.renameColumns).toEqual([]);
    expect(changes.deleteColumns).toEqual([]);
  });

  it('without the ids put back, the undone removal would be saved as renames', function() {
    var tracker = ColumnChanges.createTracker(['A', 'B', 'C']);

    tracker.remove([1]);

    // The header row is back to A, B, C but the ids still say B is gone
    var changes = tracker.getChanges(['A', 'B', 'C']);

    expect(changes.renameColumns.length > 0).toBe(true);
  });

  it('a recorded state without a full set of ids is ignored rather than read as deletions', function() {
    var tracker = ColumnChanges.createTracker(['A', 'B']);

    tracker.restore([undefined, undefined]);

    expect(tracker.getChanges(['A', 'B']).deleteColumns).toEqual([]);
  });

  it('after a save, the saved names are what the next save compares against', function() {
    var tracker = ColumnChanges.createTracker(['Name', 'Email']);
    var first = tracker.getChanges(['Name', 'Work email']);

    tracker.markSaved(first.saved);

    expect(tracker.getChanges(['Name', 'Work email']).renameColumns).toEqual([]);
    expect(tracker.getChanges(['Name', 'Contact']).renameColumns).toEqual([
      { column: 'Work email', newColumn: 'Contact' }
    ]);
  });

  it('an Undo of a rename after it was saved renames the column back', function() {
    var tracker = ColumnChanges.createTracker(['Name', 'Email']);
    var beforeRename = tracker.getIds();
    var saved = tracker.getChanges(['Name', 'Work email']);

    tracker.markSaved(saved.saved);

    // Undo loads the state from before the rename, header and ids together
    tracker.restore(beforeRename);

    expect(tracker.getChanges(['Name', 'Email']).renameColumns).toEqual([
      { column: 'Work email', newColumn: 'Email' }
    ]);
  });

  it('idOf finds the id of a column by its header, for recording a state built from names', function() {
    var tracker = ColumnChanges.createTracker(['A', 'B']);
    var ids = tracker.getIds();

    expect(tracker.idOf(['A', 'B'], 'B')).toBe(ids[1]);
    expect(tracker.idOf(['A', 'B'], 'C')).toBe(undefined);
  });
});

describe('ColumnChanges - a rename or deletion on one page reaches every page (PS-2204)', function() {
  var PAGE_SIZE = 500;

  it('renaming Email on page 1 of 2,000 rows renames it on every row, and page 2 shows only the new name', function() {
    var ds = makeDataSource(2000);
    var saved = pageColumns(ds, 0, PAGE_SIZE);
    var tracker = ColumnChanges.createTracker(saved);
    var current = ['Name', 'Work email', 'Notes'];
    var changes = tracker.getChanges(current);

    applyCommit(ds, {
      entries: gridRows(ds, 0, PAGE_SIZE, saved, current),
      columns: current,
      renameColumns: changes.renameColumns,
      deleteColumns: changes.deleteColumns
    });

    expect(pageColumns(ds, 1, PAGE_SIZE)).toEqual(['Name', 'Work email', 'Notes']);
    expect(ds.rows.every(function(row) {
      return !Object.prototype.hasOwnProperty.call(row.data, 'Email') && row.data['Work email'] === 'user' + row.id + '@example.com';
    })).toBe(true);
  });

  it('without the rename sent (the bug), page 2 shows Email again and Work email is empty there', function() {
    var ds = makeDataSource(2000);
    var saved = pageColumns(ds, 0, PAGE_SIZE);
    var current = ['Name', 'Work email', 'Notes'];

    applyCommit(ds, {
      entries: gridRows(ds, 0, PAGE_SIZE, saved, current),
      columns: current
    });

    expect(pageColumns(ds, 1, PAGE_SIZE)).toEqual(['Name', 'Work email', 'Notes', 'Email']);
    expect(ds.rows[600].data['Work email']).toBe(undefined);
  });

  it('deleting Notes on page 1 removes it from every row, and it does not come back on page 2', function() {
    var ds = makeDataSource(2000);
    var saved = pageColumns(ds, 0, PAGE_SIZE);
    var tracker = ColumnChanges.createTracker(saved);

    tracker.remove([2]);

    var current = ['Name', 'Email'];
    var changes = tracker.getChanges(current);

    applyCommit(ds, {
      entries: gridRows(ds, 0, PAGE_SIZE, saved, [current[0], current[1], null]),
      columns: current,
      renameColumns: changes.renameColumns,
      deleteColumns: changes.deleteColumns
    });

    expect(pageColumns(ds, 1, PAGE_SIZE)).toEqual(['Name', 'Email']);
    expect(ds.rows.every(function(row) {
      return !Object.prototype.hasOwnProperty.call(row.data, 'Notes');
    })).toBe(true);
  });
});
