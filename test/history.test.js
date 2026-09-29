var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var historySource = fs.readFileSync(path.join(__dirname, '../js/history.js'), 'utf8');

// PS-2204 Problem A: an undo reloaded the grid without row IDs, so the next
// change recorded a state without them and the save after it sent every row as
// new - each one re-inserted with a new ID and the original deleted.
//
// history.js registers itself on Fliplet.Registry and drives the global `hot`
// and `table`, so it runs here in a sandbox with small stand-ins for those.
function loadHistoryStack() {
  var registry = {};
  var grid = { loaded: null };

  var sandbox = {
    Fliplet: {
      Registry: {
        set: function(name, value) {
          registry[name] = value;
        }
      }
    },
    _: {
      map: function(list, fn) {
        return Array.prototype.map.call(list, fn);
      },
      forEach: function(list, fn) {
        Array.prototype.forEach.call(list, fn);
      }
    },
    $: function() {
      return { prop: function() {} };
    },
    hot: {
      loadData: function(data) {
        grid.loaded = data;
      },
      updateSettings: function() {}
    },
    table: {
      onChange: function() {}
    }
  };

  vm.runInNewContext(historySource, sandbox);

  return { stack: registry['history-stack'], grid: grid };
}

// A spreadsheet state as prepareData() builds it: the column names first, then
// one array per row carrying the entry ID as a property
function state(rows) {
  var data = [['Name', 'Seq']].concat(rows.map(function(row) {
    var entry = [row.name, row.seq];

    entry.id = row.id;

    return entry;
  }));

  return { data: data, colWidths: [100, 100] };
}

function ids(data) {
  return data.slice(1).map(function(row) {
    return row.id;
  });
}

describe('HistoryStack keeps row IDs through undo and redo (PS-2204)', function() {
  var before = [{ id: 11, name: 'Row 1', seq: 1 }, { id: 12, name: 'Row 2', seq: 2 }];
  var after = [{ id: 11, name: 'Edited', seq: 1 }, { id: 12, name: 'Row 2', seq: 2 }];

  it('undo loads the previous rows into the grid with their IDs', function() {
    var h = loadHistoryStack();

    h.stack.add(state(before));
    h.stack.add(state(after));
    h.stack.back();

    expect(h.grid.loaded[1][0]).toBe('Row 1');
    expect(ids(h.grid.loaded)).toEqual([11, 12]);
  });

  it('redo loads the later rows into the grid with their IDs', function() {
    var h = loadHistoryStack();

    h.stack.add(state(before));
    h.stack.add(state(after));
    h.stack.back();
    h.stack.forward();

    expect(h.grid.loaded[1][0]).toBe('Edited');
    expect(ids(h.grid.loaded)).toEqual([11, 12]);
  });

  it('the change after an undo records a state that still has the IDs', function() {
    var h = loadHistoryStack();

    h.stack.add(state(before));
    h.stack.add(state(after));
    h.stack.back();

    // What afterChangesObserved does next: edit a cell, then record the grid's
    // own rows (getSourceData) as the new current state
    h.grid.loaded[2][0] = 'Edited after undo';
    h.stack.add({ data: h.grid.loaded, colWidths: [100, 100] });

    expect(ids(h.stack.getCurrent().getData())).toEqual([11, 12]);
  });

  it('editing the grid after an undo does not change the stored state', function() {
    var h = loadHistoryStack();

    h.stack.add(state(before));
    h.stack.add(state(after));
    h.stack.back();

    h.grid.loaded[1][0] = 'Typed into the grid';

    expect(h.stack.getCurrent().getData()[1][0]).toBe('Row 1');
  });
});
