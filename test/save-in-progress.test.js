var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var SaveState = require('../js/save-state');

// PS-2204: a save that renames or deletes a column changes every row and can
// take several seconds on a large data source. A second save started meanwhile
// read rows the first was still changing, and wrote the old column name back on
// some of them. The Save button and Save & close now wait for a running save.

var interfaceSource = fs.readFileSync(path.join(__dirname, '../js/interface.js'), 'utf8');

// Cuts the function that starts at `marker` out of the source by brace-counting,
// as interface.js needs Fliplet/jQuery globals and can't be required here
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

function deferred() {
  var result = {};

  result.promise = new Promise(function(resolve, reject) {
    result.resolve = resolve;
    result.reject = reject;
  });

  return result;
}

function wait() {
  return new Promise(function(resolve) {
    setTimeout(resolve, 5);
  });
}

/**
 * The Save button's click handler, the Save & close handler and the real
 * saveCurrentData (with the real save lock from js/save-state.js) from
 * interface.js, with a grid that always has changes and a confirmAndCommit
 * whose commits end when the test says so
 * @returns {Object} The handlers, the button and the commits started
 */
function setup() {
  var commits = [];
  var alerts = [];
  var completed = [];
  var button = { disabled: false };
  // Any element but the Save button: chainable, remembers nothing
  var element = {};

  ['text', 'html', 'removeClass', 'addClass', 'prop', 'empty', 'append', 'show', 'hide'].forEach(function(name) {
    element[name] = function() {
      return element;
    };
  });

  element.hasClass = function() {
    return false;
  };

  var context = {
    _: { noop: function() {} },
    saveInProgress: null,
    fetchGeneration: 0,
    widgetData: {},
    SAVE_CANCELLED: { cancelled: true },
    SAVE_BUSY: { busy: true },
    SAVE_SKIPPED: { skipped: true },
    SAVED_NOT_REFRESHED: { saved: true, refreshed: false },
    COLUMNS_CHANGED_MESSAGE: 'A column was renamed or deleted elsewhere. Reload before editing.',
    saveLock: SaveState.createSaveLock(),
    updatePaginationControls: function() {},
    hideGridLoader: function() {},
    Pagination: require('../js/pagination'),
    currentPage: 0,
    lastRenderedPage: 0,
    table: {
      changes: true,
      hasChanges: function() {
        return this.changes;
      },
      setChanges: function(value) {
        this.changes = value;
      },
      onSaveComplete: function() {},
      onSaveError: function() {
        this.saveErrorShown = true;
      }
    },
    $: function(selector) {
      if (selector === '[data-save]') {
        return {
          prop: function(name, value) {
            button[name] = value;

            return this;
          }
        };
      }

      return element;
    },
    confirmAndCommit: function() {
      var commit = deferred();

      commits.push(commit);

      return commit.promise;
    },
    Fliplet: {
      Error: {
        isHandled: function() {
          return false;
        }
      },
      Modal: {
        alert: function(options) {
          alerts.push(options);
        }
      },
      parseError: String,
      Widget: {
        complete: function(result) {
          completed.push(result);
        }
      }
    },
    Promise: Promise,
    setTimeout: setTimeout,
    console: console
  };

  vm.createContext(context);
  vm.runInContext([
    'showSaveNotice',
    'hideSaveNotice',
    'refreshSaveButton',
    'renderSaveLock',
    'requireReload',
    'onSaveFailed',
    'saveCurrentData'
  ].map(function(name) {
    return extractFunction(interfaceSource, 'function ' + name + '(');
  }).join('\n')
    + '\nvar onSaveClick = ' + extractFunction(interfaceSource, ".on('click', '[data-save]'")
    + ';\nvar onSaveRequest = ' + extractFunction(interfaceSource, 'Fliplet.Widget.onSaveRequest('), context);

  return {
    click: function() {
      return context.onSaveClick.call({}, { preventDefault: function() {} });
    },
    saveAndClose: function() {
      return context.onSaveRequest();
    },
    makeChange: function() {
      context.table.changes = true;
    },
    setTable: function(value) {
      context.table = value;
    },
    button: button,
    commits: commits,
    alerts: alerts,
    completed: completed,
    table: context.table,
    saveLock: context.saveLock
  };
}

describe('one save at a time (PS-2204)', function() {
  it('ignores Save while a save is running, and saves again once it ends', function() {
    var page = setup();

    page.click();

    return wait().then(function() {
      expect(page.commits).toHaveLength(1);
      expect(page.button.disabled).toBe(true);

      // An edit and a second click while the first save is still running
      page.makeChange();
      page.click();

      return wait();
    }).then(function() {
      expect(page.commits).toHaveLength(1);

      page.commits[0].resolve();

      return wait();
    }).then(function() {
      expect(page.button.disabled).toBe(false);

      // The edit made meanwhile is still waiting to be saved
      page.click();

      return wait();
    }).then(function() {
      expect(page.commits).toHaveLength(2);
    });
  });

  it('lets Save run again after a save fails', function() {
    var page = setup();

    page.click();

    return wait().then(function() {
      page.commits[0].reject(new Error('Network error'));

      return wait();
    }).then(function() {
      expect(page.button.disabled).toBe(false);

      page.click();

      return wait();
    }).then(function() {
      expect(page.commits).toHaveLength(2);
    });
  });

  it('starts Save & close only after a running save ends', function() {
    var page = setup();

    page.click();

    return wait().then(function() {
      page.saveAndClose();

      return wait();
    }).then(function() {
      expect(page.commits).toHaveLength(1);

      page.commits[0].resolve();

      return wait();
    }).then(function() {
      expect(page.commits).toHaveLength(2);
    });
  });

  it('ignores Save while Save & close runs, and lets Save run again once it ends', function() {
    var page = setup();

    page.saveAndClose();

    return wait().then(function() {
      expect(page.commits).toHaveLength(1);
      expect(page.button.disabled).toBe(true);

      page.click();

      return wait();
    }).then(function() {
      expect(page.commits).toHaveLength(1);

      page.commits[0].resolve();

      return wait();
    }).then(function() {
      expect(page.button.disabled).toBe(false);

      page.click();

      return wait();
    }).then(function() {
      expect(page.commits).toHaveLength(2);
    });
  });

  it('lets Save run again after Save & close fails, and does not close', function() {
    var page = setup();

    page.saveAndClose();

    return wait().then(function() {
      page.commits[0].reject(new Error('Network error'));

      return wait();
    }).then(function() {
      // The overlay stays open: Save & close does not complete after a failed save
      expect(page.completed).toHaveLength(0);
      expect(page.button.disabled).toBe(false);

      page.click();

      return wait();
    }).then(function() {
      expect(page.commits).toHaveLength(2);
    });
  });

  it('keeps Save locked when a save ends with Save & close waiting behind it', function() {
    var page = setup();

    page.click();

    return wait().then(function() {
      page.saveAndClose();
      page.commits[0].resolve();

      return wait();
    }).then(function() {
      // Save & close's own save is running now
      expect(page.commits).toHaveLength(2);
      expect(page.button.disabled).toBe(true);

      page.click();

      return wait();
    }).then(function() {
      expect(page.commits).toHaveLength(2);

      page.commits[1].resolve();

      return wait();
    }).then(function() {
      expect(page.button.disabled).toBe(false);
    });
  });

  // The save's reload rebuilds the grid only once the Entries tab has a size. A
  // Save & close queued behind that save ran before the grid was back, found no
  // table, and never closed the overlay (PR #291 review).
  it("closes with the finished save's result when Save & close is queued and the grid is still being rebuilt", function() {
    var page = setup();

    page.click();

    return wait().then(function() {
      page.saveAndClose();

      return wait();
    }).then(function() {
      // The reload after the first save has taken the grid down for its render
      page.setTable(null);
      page.commits[0].resolve('reloaded');

      return wait();
    }).then(function() {
      expect(page.commits).toHaveLength(1);
      expect(page.completed).toEqual(['reloaded']);
      expect(page.button.disabled).toBe(false);
    });
  });

  // A column the grid's rows use was renamed or deleted in another tab, and the
  // API refused the save. The edits are still on screen, but the columns under
  // them are not the server's any more, so saving is blocked until a reload.
  it('explains a save refused because a column changed elsewhere, and asks for a reload', function() {
    var page = setup();

    page.click();

    return wait().then(function() {
      page.commits[0].reject({ status: 409, responseJSON: { message: 'changed somewhere else' } });

      return wait();
    }).then(function() {
      expect(page.alerts).toHaveLength(1);
      expect(page.alerts[0].title).toBe('Changes not saved');
      expect(page.alerts[0].message.indexOf('another tab') !== -1).toBe(true);
      expect(page.table.changes).toBe(false);
      expect(page.table.saveErrorShown).toBe(true);
      expect(page.saveLock.needsReload()).toBe(true);
      expect(page.button.disabled).toBe(true);
    });
  });
});
