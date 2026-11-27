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

  // Only the hooks the page actually asked for, as the real grid does
  grid.fire = function(name, r, c, r2, c2) {
    if (typeof grid.settings[name] === 'function') {
      grid.settings[name](r, c, r2, c2);
    }
  };

  // 0.38's getSelected() always returns a LIST of ranges: it maps over the
  // selected range, so one selected range comes back as [[r, c, r2, c2]]
  grid.select = function(r, c, r2, c2) {
    grid.selected = [[r, c, r2, c2]];
    grid.fire('afterSelection', r, c, r2, c2);
    grid.fire('afterSelectionEnd', r, c, r2, c2);
  };

  // A selection that grows while it is being made: the grid holds the larger
  // range, and only the hook that runs while a selection is being made (if any)
  // reports it. Shift and an arrow key behaved this way in 0.38.
  grid.extendSelection = function(r, c, r2, c2, fireHook) {
    grid.selected = [[r, c, r2, c2]];

    if (fireHook) {
      grid.fire('afterSelection', r, c, r2, c2);
    }
  };

  // Ctrl and a click adds a second range. It goes through setRangeStart, so
  // 0.38 reports it through afterSelection like any other selection change.
  grid.addRange = function(r, c, r2, c2) {
    grid.selected = (grid.selected || []).concat([[r, c, r2, c2]]);
    grid.fire('afterSelection', r, c, r2, c2);
  };

  // What deselectCell() does: the selection is cleared, so getSelected()
  // returns undefined, and afterDeselect runs
  grid.deselect = function() {
    if (!grid.selected) {
      return;
    }

    grid.selected = undefined;
    grid.fire('afterDeselect');
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
              toolbar[event + ' ' + child] = handler;
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
    // A mouse press on a toolbar button, in the order the browser runs it:
    // the button's own mousedown handler first, then 0.38's outsideClickDeselects
    // (on by default, never set here) clearing the grid selection -- it is bound
    // to document.documentElement, so it runs after the button's -- then the click
    click: function() {
      toolbar['mousedown [data-action="sign-out-everywhere"]']();

      try {
        if (context.hot) {
          context.hot.deselect();
        }
      } catch (e) {
        // A destroyed grid has had its listeners removed, so it deselects nothing
      }

      toolbar['click [data-action="sign-out-everywhere"]']();
    },
    // The mouse going down on the button with no click after it: the press was
    // released somewhere else, or the grid was replaced while it was held
    mousedown: function() {
      toolbar['mousedown [data-action="sign-out-everywhere"]']();
    },
    // Enter or Space on the focused button: a click with no mousedown, so
    // nothing deselects and the grid still reports what is selected
    keyboardClick: function() {
      toolbar['click [data-action="sign-out-everywhere"]']();
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

  // DEV-2625 FUNC-002: with Shift and an arrow key the selection grew past one
  // row without the selection-END hook running. The button kept the range that
  // hook had last reported, stayed enabled, and offered to sign out the single
  // user it had been on. No hook fires here, so this holds whatever 0.38 reports
  // while a range grows: the grown range is read from the grid on mousedown.
  it('sends nothing after Shift and an arrow key grow the selection past one row', function() {
    page.loadDetails(loginSource);

    var grid = page.openGrid(rows);

    grid.select(1, 0, 1, 0);
    expect(page.button().disabled).toBe(false);

    // Shift and Down: the range grows, and no hook reports it
    grid.extendSelection(1, 0, 2, 0);

    page.click();

    return flush().then(function() {
      expect(page.calls).toHaveLength(0);
    });
  });

  // The other side of the same mechanism: the row a mouse click acts on comes
  // from the grid, read when the mouse went down, so the button works for a
  // selection no hook ever reported
  it('acts on the row the grid reported at mousedown, hooks or not', function() {
    page.loadDetails(loginSource);

    var grid = page.openGrid(rows);

    // One row selected, with no hook reporting it
    grid.extendSelection(1, 0, 1, 0);

    page.click();

    return flush().then(function() {
      var request = page.calls.filter(function(call) { return call.type === 'request'; });

      expect(request).toHaveLength(1);
      expect(JSON.stringify(request[0].data)).toBe(JSON.stringify({ dataSourceId: 34, entryId: 501 }));
    });
  });

  // The grid is asked before the snapshot, so a selection the hooks never
  // reported is still refused on the keyboard path too, where no mousedown ran
  // and nothing deselected the grid.
  it('sends nothing when the grid itself reports more than one row, hooks or not', function() {
    page.loadDetails(loginSource);

    var grid = page.openGrid(rows);

    grid.select(1, 0, 1, 0);
    expect(page.button().disabled).toBe(false);

    // The grid holds two rows now; no hook said so
    grid.extendSelection(1, 0, 2, 0);

    page.keyboardClick();

    return flush().then(function() {
      expect(page.calls).toHaveLength(0);
    });
  });

  it('disables the button while the selection grows, not only once it ends', function() {
    page.loadDetails(loginSource);

    var grid = page.openGrid(rows);

    grid.select(1, 0, 1, 0);

    grid.extendSelection(1, 0, 2, 0, true);
    expect(page.button().disabled).toBe(true);

    grid.extendSelection(2, 0, 2, 0, true);
    expect(page.button().disabled).toBe(false);
  });

  it('sends nothing when the grid holds more than one selected range', function() {
    page.loadDetails(loginSource);

    var grid = page.openGrid(rows);

    grid.select(1, 0, 1, 0);

    // Ctrl and a click on a second row
    grid.addRange(2, 0, 2, 0);

    expect(page.run('getSignOutEverywhereEntryId()')).toBe(undefined);
    expect(page.button().disabled).toBe(true);

    page.click();

    return flush().then(function() {
      expect(page.calls).toHaveLength(0);
    });
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

  it('tells apart two users who share the first login column (FUNC-006)', function() {
    // Login columns listed with the shared value first, as ['PIN', 'Username'] was
    page.loadDetails({ id: 34, appId: 12, apps: [], definition: { login: { columns: ['Name', 'Email'] } } });

    var grid = page.openGrid([
      { id: 501, data: { Email: 'ann@example.com', Name: '4417' } },
      { id: 502, data: { Email: 'bob@example.com', Name: '4417' } }
    ]);

    grid.select(1, 0, 1, 0);
    page.click();

    return flush().then(function() {
      grid.select(2, 0, 2, 0);
      page.click();

      return flush();
    }).then(function() {
      var confirm = page.calls.filter(function(call) { return call.type === 'confirm'; });

      expect(confirm).toHaveLength(2);
      expect(confirm[0].message.indexOf('Sign <strong>4417 · ann@example.com</strong> (entry ID <strong>501</strong>) out') === 0).toBe(true);
      expect(confirm[1].message.indexOf('Sign <strong>4417 · bob@example.com</strong> (entry ID <strong>502</strong>) out') === 0).toBe(true);
    });
  });

  it('does not show a hashed login column in the confirmation', function() {
    page.loadDetails({
      id: 34,
      appId: 12,
      apps: [],
      definition: { login: { columns: ['Name', 'Email'] } },
      hooks: [{ type: 'operations', payload: { Name: ['hash'] } }]
    });

    page.openGrid(rows).select(2, 0, 2, 0);
    page.click();

    return flush().then(function() {
      var confirm = page.calls.filter(function(call) { return call.type === 'confirm'; });

      expect(confirm[0].message.indexOf('Sign <strong>bob@example.com</strong> (entry ID <strong>502</strong>) out') === 0).toBe(true);
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

    // The state the validator reproduced: the global still points at the
    // destroyed grid, which throws on every read
    expect(page.run('(function() { try { hot.getSelected(); return false; } catch (e) { return true; } })()')).toBe(true);

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

  // A grid can be replaced without the old one being destroyed first. Neither
  // reading is allowed to answer with the old grid's selection.
  it('ignores a selection belonging to a grid that is no longer on screen', function() {
    page.loadDetails(loginSource);

    var gridA = page.openGrid(rows);

    gridA.select(1, 0, 1, 0);
    expect(page.button().disabled).toBe(false);

    // Grid B replaces A in place, with nothing selected in it
    page.openGrid([
      { id: 701, data: { Email: 'eve@example.com', Name: 'Eve' } },
      { id: 702, data: { Email: 'fay@example.com', Name: 'Fay' } }
    ]);

    expect(page.button().disabled).toBe(true);
    expect(page.run('getSignOutEverywhereEntryId()')).toBe(undefined);

    page.click();

    return flush().then(function() {
      expect(page.calls).toHaveLength(0);
    });
  });

  // DEV-2625 C2: what the mousedown read answers that click and nothing after
  // it. Once the click is done, both the button's state and the keyboard path
  // follow the grid again.
  it('follows the grid again once the click it was taken for is done', function() {
    page.loadDetails(loginSource);

    var grid = page.openGrid(rows);

    grid.select(1, 0, 1, 0);
    page.click();

    return flush().then(function() {
      expect(page.calls.filter(function(call) { return call.type === 'request'; })).toHaveLength(1);

      // The click deselected the grid, so nothing is selected to act on
      expect(page.button().disabled).toBe(true);
      expect(page.run('getSignOutEverywhereEntryId()')).toBe(undefined);

      // ...and a second press sends nothing
      page.click();

      return flush();
    }).then(function() {
      expect(page.calls.filter(function(call) { return call.type === 'request'; })).toHaveLength(1);
    });
  });

  it('does not let the keyboard act on the row an earlier mouse press was on', function() {
    page.loadDetails(loginSource);
    page.options.confirm = false;

    var grid = page.openGrid(rows);

    // Ann's row, pressed with the mouse and cancelled
    grid.select(1, 0, 1, 0);
    page.click();

    return flush().then(function() {
      // Enter on the button with nothing selected
      page.keyboardClick();

      return flush();
    }).then(function() {
      expect(page.calls.filter(function(call) { return call.type === 'request'; })).toHaveLength(0);
      expect(page.calls.filter(function(call) { return call.type === 'confirm'; })).toHaveLength(1);
    });
  });

  // A press that never became a click (the mouse was released off the button)
  // must not outlive the selection it was taken from
  it('drops a snapshot once a different row is selected', function() {
    page.loadDetails(loginSource);

    var grid = page.openGrid(rows);

    // Ann's row, with the mouse going down on the button but no click after it
    grid.select(1, 0, 1, 0);
    page.mousedown();

    // Bob's row, then nothing selected at all
    grid.select(2, 0, 2, 0);
    grid.deselect();

    expect(page.run('getSignOutEverywhereEntryId()')).toBe(undefined);
    expect(page.button().disabled).toBe(true);

    page.keyboardClick();

    return flush().then(function() {
      expect(page.calls).toHaveLength(0);
    });
  });

  it('disables the button when the grid selection is cleared', function() {
    page.loadDetails(loginSource);

    var grid = page.openGrid(rows);

    grid.select(1, 0, 1, 0);
    expect(page.button().disabled).toBe(false);

    grid.deselect();
    expect(page.button().disabled).toBe(true);
  });

  // The check that a snapshot belongs to the grid on screen: the mouse went
  // down on the button while grid A was up, no click followed, and grid B
  // replaced A in place. Row 1 of B is a different user.
  it('ignores a snapshot taken from a grid that is no longer on screen', function() {
    page.loadDetails(loginSource);

    var gridA = page.openGrid(rows);

    gridA.select(1, 0, 1, 0);
    page.mousedown();

    page.openGrid([
      { id: 701, data: { Email: 'eve@example.com', Name: 'Eve' } },
      { id: 702, data: { Email: 'fay@example.com', Name: 'Fay' } }
    ]);

    expect(page.run('getSignOutEverywhereEntryId()')).toBe(undefined);
    expect(page.button().disabled).toBe(true);
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

    // The press deselected the grid, so select the row again: the button follows
    // the grid, and the save is now the only thing holding it
    grid.select(1, 0, 1, 0);
    expect(page.button().disabled).toBe(true);

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

      // Nothing is selected after the press, so the button is disabled; the
      // busy state cleared, which selecting a row again shows
      expect(page.button().disabled).toBe(true);
      grid.select(1, 0, 1, 0);
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

      // The busy state cleared: the row has to be selected again, as nothing is
      expect(page.button().disabled).toBe(true);
      grid.select(1, 0, 1, 0);
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

      // The busy state cleared: the row has to be selected again, as nothing is
      expect(page.button().disabled).toBe(true);
      grid.select(1, 0, 1, 0);
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
