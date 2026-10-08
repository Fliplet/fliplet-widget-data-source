// PS-2293: pressing Enter before the debounced find runs must search the
// current text, not step through the results of an earlier keystroke.
//
// spreadsheet.js is a browser global script, so it is loaded into a vm context
// with just enough stubs to drive the real input and keydown handlers.
var test = require('node:test');
var describe = test.describe;
var it = test.it;
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var expect = require('./expect');

var source = fs.readFileSync(path.join(__dirname, '../js/spreadsheet.js'), 'utf8');

function load(cells, applySearchFilter) {
  var handlers = {};
  var pending = null;
  var message = { html: '' };
  var queries = [];
  var field = { value: '', focus: function() {} };

  // Any jQuery chain is a no-op, except the "N found" message we assert on
  function $(selector) {
    var chain = new Proxy({}, {
      get: function(target, prop) {
        if (prop === 'html' && selector === '.find-results') {
          return function(html) {
            message.html = html;
          };
        }

        return function() {
          return chain;
        };
      }
    });

    return chain;
  }

  var context = {
    $: $,
    Fliplet: { Registry: { get: function() {
      return {};
    } } },
    document: {
      getElementById: function() {
        return field;
      },
      addEventListener: function() {}
    },
    Handsontable: {
      dom: {
        addEvent: function(el, type, fn) {
          handlers[type] = fn;
        }
      }
    },
    _: {
      // Manual debounce: flush() stands in for the 500ms timer firing
      debounce: function(fn) {
        var debounced = function() {
          pending = fn;
        };

        debounced.cancel = function() {
          pending = null;
        };

        return debounced;
      }
    },
    setTimeout: function(fn) {
      fn();
    },
    // interface.js's server-side search hook (PS-2313); off unless a test says so
    applySearchFilter: applySearchFilter || function() {
      return false;
    }
  };

  vm.createContext(context);
  vm.runInContext(source, context);

  context.hot = {
    search: {
      query: function(value) {
        queries.push(value);

        return cells
          .map(function(text, col) {
            return { row: 0, col: col, text: text };
          })
          .filter(function(cell) {
            return value && cell.text.toLowerCase().indexOf(value.toLowerCase()) > -1;
          });
      }
    },
    selection: { selectedHeader: {} },
    selectCell: function() {},
    render: function() {}
  };

  return {
    message: message,
    queries: queries,
    type: function(value) {
      field.value = value;
      handlers.input();
    },
    key: function(keyCode, extra) {
      handlers.keydown(Object.assign({ keyCode: keyCode }, extra));
    },
    flush: function() {
      var fn = pending;

      pending = null;

      if (fn) {
        fn();
      }
    }
  };
}

describe('Data source search', function() {
  var cells = ['status', 'Main Stage', 'Strategy', 'test', 'status update'];

  it('searches the typed text when Enter is pressed before the debounce fires', function() {
    var grid = load(['demo data', 'demo data', 'demo', 'other']);

    grid.type('demo');
    grid.key(13);

    expect(grid.queries).toEqual(['demo']);
    expect(grid.message.html).toBe('1 of 3 found');
  });

  it('does not keep the results of an earlier keystroke', function() {
    var grid = load(cells);

    grid.type('st');
    grid.flush();
    expect(grid.message.html).toBe('1 of 5 found');

    grid.type('status');
    grid.key(13);
    // The pending find was cancelled; firing it would be a no-op anyway
    grid.flush();

    expect(grid.queries).toEqual(['st', 'status']);
    expect(grid.message.html).toBe('1 of 2 found');
  });

  it('applies the same to Shift+Enter and Ctrl/Cmd+G', function() {
    var prev = load(cells);
    var ctrlG = load(cells);

    prev.type('status');
    prev.key(13, { shiftKey: true });
    ctrlG.type('status');
    ctrlG.key(71, { ctrlKey: true, preventDefault: function() {} });

    expect(prev.message.html).toBe('1 of 2 found');
    expect(ctrlG.message.html).toBe('1 of 2 found');
  });

  it('still steps through results when the text has not changed', function() {
    var grid = load(cells);

    grid.type('st');
    grid.flush();
    grid.key(13);
    grid.key(13);

    expect(grid.queries).toEqual(['st']);
    expect(grid.message.html).toBe('3 of 5 found');
  });

  // PS-2313: on a paginated data source the term goes to the server instead
  it('leaves the grid search to interface.js when it takes the term', function() {
    var terms = [];
    var grid = load(cells, function(term) {
      terms.push(term);

      return true;
    });

    grid.type('smith');
    grid.flush();

    expect(terms).toEqual(['smith']);
    expect(grid.queries).toEqual([]);
  });

  it('searches the grid when interface.js declines the term', function() {
    var grid = load(cells, function() {
      return false;
    });

    grid.type('smith');
    grid.flush();

    expect(grid.queries).toEqual(['smith']);
    expect(grid.message.html).toBe('0 found');
  });
});
