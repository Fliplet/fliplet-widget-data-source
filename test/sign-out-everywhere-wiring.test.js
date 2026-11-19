/* global Proxy */
// The "Sign out everywhere" button as spreadsheet.js wires it to the grid.
//
// sign-out-everywhere.test.js covers the rules on their own. This runs the real
// spreadsheet.js against a stand-in grid, because the ways it went wrong were
// all in the wiring: reading a grid that had already been destroyed broke the
// load of the next data source, and the row it acts on has to be read through
// the grid's own row mapping when the grid is sorted or rows were moved.
var test = require('node:test');
var describe = test.describe;
var it = test.it;
var beforeEach = test.beforeEach;
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var expect = require('./expect');

var root = path.join(__dirname, '..');
var emailLogin = { validation: { email: { matchColumn: 'Email' } } };
var BUTTON = '#toolbar [data-action="sign-out-everywhere"]';
var GROUP = '#toolbar [data-sign-out-everywhere]';

/**
 * A stand-in for a Handsontable 0.38 instance: the hooks it was given, its
 * rows, and a visual-to-physical row map for sorted or moved rows. Destroying
 * it replaces every method with one that throws, as 0.38 does.
 * @param {Object} element - Unused, as in the real constructor's first argument
 * @param {Object} settings - Grid settings, including the hooks
 * @returns {undefined}
 */
function FakeGrid(element, settings) {
  var grid = this;

  grid.settings = settings;
  grid.data = settings.data;
  grid.rowMap = {};

  grid.toPhysicalRow = function(row) {
    return Object.prototype.hasOwnProperty.call(grid.rowMap, row) ? grid.rowMap[row] : row;
  };

  grid.getSourceDataAtRow = function(row) {
    return grid.data[row];
  };

  grid.getDataAtRow = function(row) {
    return grid.data[grid.toPhysicalRow(row)];
  };

  grid.getDataAtCell = function(row, col) {
    var data = grid.getDataAtRow(row);

    return data ? data[col] : undefined;
  };

  grid.getSelected = function() {
    return grid.selected;
  };

  grid.getColHeader = function() {
    return [];
  };

  grid.getColWidth = function() {
    return 50;
  };

  grid.getPlugin = function() {
    return {};
  };

  grid.select = function(r, c, r2, c2) {
    grid.selected = [r, c, r2, c2];
    grid.settings.afterSelectionEnd(r, c, r2, c2);
  };

  grid.destroy = function() {
    Object.keys(grid).forEach(function(key) {
      if (typeof grid[key] === 'function') {
        grid[key] = function() {
          throw new Error('This method cannot be called because this Handsontable instance has been destroyed');
        };
      }
    });
  };
}

function loadSpreadsheet() {
  var ui = {};
  var toolbar = {};
  var calls = [];
  var options = { confirm: true, response: { sessionsEnded: 2, complete: true } };

  function element(selector) {
    ui[selector] = ui[selector] || {};

    var self = new Proxy({}, {
      get: function(target, key) {
        if (key === 'toggleClass') {
          return function(name, value) {
            ui[selector][name] = value;

            return self;
          };
        }

        if (key === 'prop') {
          return function(name, value) {
            ui[selector][name] = value;

            return self;
          };
        }

        if (key === 'on') {
          return function(event, child, handler) {
            if (selector === '#toolbar' && handler) {
              toolbar[child] = handler;
            }

            return self;
          };
        }

        if (key === 'html') {
          return function() {
            return arguments.length ? self : '';
          };
        }

        return function() {
          return self;
        };
      }
    });

    return self;
  }

  var history = {
    add: function() {},
    reset: function() {},
    back: function() {},
    forward: function() {},
    getCurrent: function() {
      return { getData: function() { return []; }, setData: function() {} };
    }
  };

  var Fliplet = {
    Registry: { get: function() { return history; } },
    Modal: {
      confirm: function(config) {
        calls.push({ type: 'confirm', message: config.message });

        if (options.confirmThrows) {
          throw new Error('confirm broke');
        }

        return Promise.resolve(options.confirm);
      },
      alert: function(config) {
        calls.push({ type: 'alert', title: config.title, message: config.message });
      }
    },
    API: {
      request: function(config) {
        calls.push({ type: 'request', url: config.url, data: config.data });

        return options.error ? Promise.reject(options.error) : Promise.resolve(options.response);
      }
    },
    parseError: function(error) {
      return 'parsed: ' + (error && error.message);
    }
  };

  var debounce = function(fn) {
    fn.cancel = function() {};

    return fn;
  };

  var context = {
    $: element,
    Fliplet: Fliplet,
    Handsontable: FakeGrid,
    GridSort: { isSortApplied: function() { return false; } },
    _: { debounce: debounce, throttle: debounce },
    document: {
      addEventListener: function() {},
      getElementById: function() {
        return { value: '', addEventListener: function() {} };
      }
    },
    window: {},
    console: console,
    // Deferred work (search, notices) is not what these specs are about
    setTimeout: function() {},
    clearTimeout: function() {}
  };

  context.Handsontable.dom = { addEvent: function() {} };

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/sign-out-everywhere.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/spreadsheet.js'), 'utf8'), context);
  // What interface.js declares and spreadsheet.js reads
  vm.runInContext([
    'var widgetData = { appId: 12 };',
    'var currentDataSourceId = 34;',
    'var currentDataSourceDefinition = {};',
    'var table;',
    'var $sourceContents = $("#source-contents");',
    'var $initialSpinnerLoading = $(".spinner-holder");'
  ].join('\n'), context);

  return {
    context: context,
    ui: ui,
    calls: calls,
    options: options,
    run: function(code) {
      return vm.runInContext(code, context);
    },
    // The call interface.js makes once a data source's details have loaded
    loadDetails: function(dataSource) {
      context.setSignOutEverywhereDataSource(dataSource);
    },
    openGrid: function(rows) {
      context.__rows = rows;
      vm.runInContext('table = spreadsheet({ columns: ["Email", "Name"], rows: __rows });', context);

      return context.hot;
    },
    click: function() {
      toolbar['[data-action="sign-out-everywhere"]']();
    },
    button: function() {
      return { hidden: ui[GROUP].hidden, disabled: ui[BUTTON].disabled };
    }
  };
}

function flush() {
  var chain = Promise.resolve();

  for (var i = 0; i < 10; i++) {
    chain = chain.then(function() {
      return new Promise(function(resolve) {
        setImmediate(resolve);
      });
    });
  }

  return chain;
}

var rows = [
  { id: 501, data: { Email: 'ann@example.com', Name: 'Ann' } },
  { id: 502, data: { Email: 'bob@example.com', Name: 'Bob' } }
];
var loginSource = { id: 34, appId: 12, apps: [], definition: emailLogin };

describe('Sign out everywhere, wired to the grid', function() {
  var page;

  beforeEach(function() {
    page = loadSpreadsheet();
  });

  it('shows the button disabled on a new grid, and enables it for one selected saved row', function() {
    page.loadDetails(loginSource);

    var grid = page.openGrid(rows);

    expect(page.button()).toEqual({ hidden: false, disabled: true });

    grid.select(1, 0, 1, 1);
    expect(page.button()).toEqual({ hidden: false, disabled: false });

    // Several rows
    grid.select(1, 0, 2, 0);
    expect(page.button().disabled).toBe(true);

    // A spare row that was never saved
    grid.select(5, 0, 5, 0);
    expect(page.button().disabled).toBe(true);
  });

  it('sends the entry of the row on screen when the grid is sorted or rows were moved', function() {
    page.loadDetails(loginSource);

    var grid = page.openGrid(rows);

    // The first visual row is the second physical one
    grid.rowMap = { 1: 2, 2: 1 };
    grid.select(1, 0, 1, 0);
    page.click();

    return flush().then(function() {
      var request = page.calls.filter(function(call) { return call.type === 'request'; });
      var confirm = page.calls.filter(function(call) { return call.type === 'confirm'; });

      expect(request).toHaveLength(1);
      expect(request[0].url).toBe('v1/apps/12/sessions/revoke');
      expect(JSON.stringify(request[0].data)).toBe(JSON.stringify({ dataSourceId: 34, entryId: 502 }));
      expect(confirm[0].message.indexOf('<strong>bob@example.com</strong>') > -1).toBe(true);
    });
  });

  it('never reads a destroyed grid, so loading the next data source does not fail', function() {
    page.loadDetails(loginSource);

    var gridA = page.openGrid(rows);

    gridA.select(1, 0, 1, 0);
    expect(page.button().disabled).toBe(false);

    // Back to the list
    page.run('table.destroy();');
    expect(page.button().disabled).toBe(true);

    // Opening data source B: its details load before its grid
    page.run('currentDataSourceId = 35;');
    page.loadDetails({ id: 35, appId: 12, apps: [], definition: emailLogin });
    expect(page.button()).toEqual({ hidden: false, disabled: true });
  });

  it('survives a destroyed grid still being referenced with a selection', function() {
    page.loadDetails(loginSource);

    var gridA = page.openGrid(rows);

    gridA.select(1, 0, 1, 0);
    gridA.destroy();

    // The state the validator reproduced: the global still points at a
    // destroyed grid that holds the last selection
    expect(page.run('hot === selectionGrid')).toBe(true);

    page.run('currentDataSourceId = 35;');
    page.loadDetails({ id: 35, appId: 12, apps: [], definition: emailLogin });
    expect(page.button()).toEqual({ hidden: false, disabled: true });

    page.click();

    return flush().then(function() {
      expect(page.calls).toHaveLength(0);
    });
  });

  it('does not carry a selection from one grid over to the next', function() {
    page.loadDetails(loginSource);

    var gridA = page.openGrid(rows);

    gridA.select(2, 0, 2, 0);
    expect(page.button().disabled).toBe(false);

    // Back, then open data source B: same row number, different user
    page.run('table.destroy();');
    page.run('currentDataSourceId = 35;');
    page.loadDetails({ id: 35, appId: 12, apps: [], definition: emailLogin });
    page.openGrid([
      { id: 601, data: { Email: 'cat@example.com', Name: 'Cat' } },
      { id: 602, data: { Email: 'dan@example.com', Name: 'Dan' } }
    ]);

    expect(page.button()).toEqual({ hidden: false, disabled: true });

    page.click();

    return flush().then(function() {
      expect(page.calls).toHaveLength(0);
    });
  });

  it('stays disabled with unsaved changes, and a click then does nothing', function() {
    page.loadDetails(loginSource);

    var grid = page.openGrid(rows);

    grid.select(1, 0, 1, 0);
    page.run('table.setChanges(true);');
    expect(page.button().disabled).toBe(true);

    page.click();

    return flush().then(function() {
      expect(page.calls).toHaveLength(0);
    });
  });

  it('stays disabled while a save is running', function() {
    page.loadDetails(loginSource);

    var grid = page.openGrid(rows);

    grid.select(1, 0, 1, 0);

    // The save handler clears the change flag before the save has finished
    page.run('table.setChanges(false); table.onSave();');
    expect(page.button().disabled).toBe(true);

    page.click();
    expect(page.calls).toHaveLength(0);

    page.run('table.onSaveComplete();');
    expect(page.button().disabled).toBe(false);

    page.run('table.onSave(); table.onSaveError();');
    expect(page.button().disabled).toBe(false);
  });

  it('clears the busy state when the admin cancels', function() {
    page.loadDetails(loginSource);
    page.options.confirm = false;

    var grid = page.openGrid(rows);

    grid.select(1, 0, 1, 0);
    page.click();
    expect(page.button().disabled).toBe(true);

    return flush().then(function() {
      expect(page.calls.filter(function(call) { return call.type === 'request'; })).toHaveLength(0);
      expect(page.button().disabled).toBe(false);
    });
  });

  it('shows one error alert and clears the busy state when the request fails', function() {
    page.loadDetails(loginSource);
    page.options.error = new Error('Not allowed');

    var grid = page.openGrid(rows);

    grid.select(1, 0, 1, 0);
    page.click();

    return flush().then(function() {
      var alerts = page.calls.filter(function(call) { return call.type === 'alert'; });

      expect(alerts).toHaveLength(1);
      expect(alerts[0].message).toBe('parsed: Not allowed');
      expect(page.button().disabled).toBe(false);
    });
  });

  it('shows one error alert and clears the busy state when something throws before the request', function() {
    page.loadDetails(loginSource);
    page.options.confirmThrows = true;

    var grid = page.openGrid(rows);

    grid.select(1, 0, 1, 0);
    page.click();

    return flush().then(function() {
      var alerts = page.calls.filter(function(call) { return call.type === 'alert'; });

      expect(alerts).toHaveLength(1);
      expect(alerts[0].message).toBe('parsed: confirm broke');
      expect(page.button().disabled).toBe(false);
    });
  });

  it('hides the button for a data source the app does not use, as listed under all data sources', function() {
    page.loadDetails({ id: 34, appId: 99, apps: [{ id: 77 }], definition: emailLogin });
    page.openGrid(rows).select(1, 0, 1, 0);

    expect(page.button()).toEqual({ hidden: true, disabled: true });
  });

  it('shows the button for a data source the app uses but does not own', function() {
    page.loadDetails({ id: 34, appId: 99, apps: [{ id: 12 }], definition: emailLogin });
    page.openGrid(rows).select(1, 0, 1, 0);

    expect(page.button()).toEqual({ hidden: false, disabled: false });
  });

  it('hides the button until the details of the data source on screen have loaded', function() {
    page.loadDetails(loginSource);
    page.openGrid(rows).select(1, 0, 1, 0);

    // What browseDataSource does before loading another data source
    page.run('currentDataSourceId = 35;');
    page.loadDetails(null);

    expect(page.button()).toEqual({ hidden: true, disabled: true });
  });
});
