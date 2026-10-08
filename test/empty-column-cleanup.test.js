var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var Pagination = require('../js/pagination');
var SaveState = require('../js/save-state');
var DuplicateRows = require('../js/duplicate-rows');

// PS-2204: on a data source of 500 rows or fewer, the save removes empty
// "Column (n)" columns from the grid. It worked out the grid position from the
// column list with header-less columns left out, so with a spare column to the
// left it removed the column next to it. The column tracker then sent that
// column as deleted, and the API removed it from every row.

var interfaceSource = fs.readFileSync(path.join(__dirname, '../js/interface.js'), 'utf8');

// Cuts `function name(...) { ... }` out of the source by brace-counting, as
// interface.js needs Fliplet/jQuery globals and can't be required here
function extractFunction(source, functionName) {
  var startIndex = source.indexOf('function ' + functionName + '(');

  if (startIndex === -1) {
    throw new Error('Could not find function ' + functionName + ' in source');
  }

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

  throw new Error('Could not find matching closing brace for function ' + functionName);
}

// The lodash calls the save path makes
var lodash = {
  some: function(list) {
    return list.some(Boolean);
  },
  forEach: function(list, fn) {
    for (var i = 0; i < list.length; i++) {
      if (fn(list[i], i) === false) {
        break;
      }
    }
  },
  filter: function(list, fn) {
    return list.filter(fn);
  },
  omitBy: function(object, fn) {
    var result = {};

    Object.keys(object).forEach(function(key) {
      if (!fn(object[key], key)) {
        result[key] = object[key];
      }
    });

    return result;
  },
  zipObject: function(keys, values) {
    var result = {};

    keys.forEach(function(key, i) {
      result[key] = values[i];
    });

    return result;
  }
};

/**
 * A page bar whose controls record whether they are disabled, for the calls
 * updatePaginationControls and navigateToPage make
 * @returns {Object} The bar, with `disabled` per control and `all` for the three
 */
function createPageBar() {
  var bar = { disabled: {} };

  function control(selector) {
    var chain = {
      prop: function(name, value) {
        selector.split(', ').forEach(function(name) {
          bar.disabled[name] = value;
        });

        return chain;
      },
      val: function() {
        return chain;
      },
      attr: function() {
        return chain;
      },
      text: function() {
        return chain;
      }
    };

    return chain;
  }

  bar.find = control;

  bar.toggleClass = function() {
    return bar;
  };

  bar.all = control('[data-page-prev], [data-page-next], [data-page-jump]');

  return bar;
}

/**
 * Runs the widget's save (saveCurrentData, through confirmAndCommit and
 * commitCurrentData) against a grid whose header row is `headers`, in the
 * order the columns are shown (null for a column without a name). The grid
 * removes columns the way HOT 0.38's alter('remove_col') does: by visual
 * index. A saved column the save removes from the grid is reported as
 * deleted, as js/column-changes.js does. The save lock is the real one
 * (js/save-state.js), so the loader and the page bar follow it as they do in
 * the widget (PS-2251).
 * @param {Array} headers Header row, in the order the columns are shown
 * @param {Array} rows Data of each row on the page
 * @param {Object} [options] `commit` returns the promise the commit resolves with,
 *   `fetchStarted` is called each time the save reloads the grid, `duringCommit`
 *   is called once the commit has started, `totalEntries` and `currentPage` set
 *   the size of the data source and the page shown
 * @returns {Promise} The grid after the save, the columns it removed, the commit
 *   sent, and the page bar and widget state after it
 */
function save(headers, rows, options) {
  options = options || {};

  var grid = headers.slice();
  var savedColumns = headers.filter(function(header) {
    return header !== null && !/^Column\s\([0-9]+\)$/.test(header);
  });
  var removed = [];
  var commits = [];
  // The loader over the grid (.page-loading-overlay)
  var loader = { hidden: true, text: '' };
  // The page bar under the grid (.pagination-controls): whether each control is disabled
  var pageBar = createPageBar();
  // Any other element: chainable, remembers nothing
  var element = {};

  ['text', 'html', 'removeClass', 'addClass', 'prop', 'empty', 'append', 'show', 'hide'].forEach(function(name) {
    element[name] = function() {
      return element;
    };
  });

  element.hasClass = function() {
    return false;
  };

  var table = {
    onSave: function() {},
    getData: function() {
      return rows.map(function(row) {
        return { data: Object.assign({}, row) };
      });
    },
    getColumns: function() {
      return grid.slice();
    },
    getColWidths: function() {
      return grid.map(function() {
        return 100;
      });
    },
    getColumnChanges: function() {
      return {
        renameColumns: [],
        deleteColumns: savedColumns.filter(function(column) {
          return grid.indexOf(column) === -1;
        }),
        expectColumns: savedColumns.slice(),
        saved: []
      };
    },
    hasChanges: function() {
      return false;
    },
    markColumnsSaved: function() {},
    setData: function() {},
    clearRowsMoved: function() {}
  };

  var context = {
    _: lodash,
    table: table,
    hot: {
      alter: function(action, index, amount) {
        removed = removed.concat(grid.splice(index, amount));
      },
      // Header row first, then each row's cells in grid order
      getData: function() {
        return [grid.slice()].concat(rows.map(function(row) {
          return grid.map(function(header) {
            return header === null ? null : row[header];
          });
        }));
      }
    },
    totalEntries: options.totalEntries || rows.length,
    PAGE_SIZE: 500,
    emptyColumnNameRegex: /^Column\s\([0-9]+\)$/,
    currentDataSourceId: 1,
    currentDataSource: {
      commit: function(body) {
        commits.push(body);

        if (options.duringCommit) {
          options.duringCommit(context, pageBar, loader);
        }

        return options.commit ? options.commit() : Promise.resolve({ clientIds: [] });
      }
    },
    currentPage: options.currentPage || 0,
    totalPages: 1,
    fetchGeneration: 0,
    saveInProgress: null,
    showingDemoData: false,
    DEMO_ROW_VALUE: 'demo data',
    DEMO_ROW_COUNT: 2,
    SAVE_CANCELLED: { cancelled: true },
    SAVE_BUSY: { busy: true },
    SAVE_SKIPPED: { skipped: true },
    SAVED_NOT_REFRESHED: { saved: true, refreshed: false },
    FETCH_ERROR_MESSAGE: 'Error loading data source.',
    SAVE_ERROR_MESSAGE: 'Error saving data source.',
    COLUMNS_CHANGED_MESSAGE: 'A column was renamed or deleted elsewhere. Reload before editing.',
    SaveState: SaveState,
    DuplicateRows: DuplicateRows,
    saveLock: SaveState.createSaveLock(),
    Pagination: Pagination,
    $: function(selector) {
      if (selector === '.pagination-controls') {
        return pageBar;
      }

      if (selector === '[data-page-prev], [data-page-next], [data-page-jump]') {
        return pageBar.all;
      }

      if (selector === '.page-loading-overlay') {
        return {
          text: function(text) {
            loader.text = text;

            return this;
          },
          removeClass: function() {
            loader.hidden = false;

            return this;
          },
          addClass: function() {
            loader.hidden = true;

            return this;
          },
          hasClass: function() {
            return loader.hidden;
          }
        };
      }

      return element;
    },
    pageEdges: null,
    locale: 'en',
    TD: function() {
      return '';
    },
    fetchCurrentDataSourceEntries: function() {
      if (options.fetchStarted) {
        options.fetchStarted(context, loader);
      }

      // The reload's render takes the loader down (renderSpreadsheet)
      context.hideGridLoader();

      return Promise.resolve();
    },
    getCommitPayload: function(entries) {
      return { entries: entries, delete: [], orders: {} };
    },
    cacheOriginalEntries: function() {},
    CommitNotice: {
      forDeclined: function() {
        return null;
      }
    },
    Fliplet: {
      DataSources: {
        getById: function() {
          return Promise.resolve({});
        },
        update: function() {
          return Promise.resolve();
        }
      },
      Modal: {
        alert: function() {
          return Promise.resolve();
        },
        confirm: function() {
          return Promise.resolve(true);
        }
      }
    },
    Promise: Promise,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    console: console
  };

  vm.createContext(context);
  vm.runInContext([
    'showGridLoader',
    'hideGridLoader',
    'trimColumns',
    'getEmptyColumns',
    'removeEmptyColumnsInEntries',
    'updatePaginationControls',
    'navigateToPage',
    'isSaveLocked',
    'showSaveNotice',
    'alertReloadFirst',
    'hideSaveNotice',
    'refreshSaveButton',
    'renderSaveLock',
    'requireReload',
    'onGridReloaded',
    'reloadGrid',
    'onUnconfirmedSave',
    'saveCurrentData',
    'confirmAndCommit',
    'commitCurrentData'
  ].map(function(name) {
    return extractFunction(interfaceSource, name);
  }).join('\n'), context);

  return context.saveCurrentData().then(function() {
    return { grid: grid, removed: removed, commit: commits[0], loader: loader, pageBar: pageBar, context: context };
  });
}

describe('empty column cleanup on save (PS-2204)', function() {
  var rows = [
    { A: 'a1', B: 'b1', C: 'c1', D: 'd1' },
    { A: 'a2', B: 'b2', C: 'c2', D: 'd2' }
  ];

  it('removes the empty column, not the one beside it, when a spare column is to its left', function() {
    // A spare column dragged to the front, then "Column (9)" typed into a spare header
    var headers = [null, 'A', 'B', 'C', 'D', 'Column (9)', null, null];

    return save(headers, rows).then(function(result) {
      expect(result.removed).toEqual(['Column (9)']);
      expect(result.grid).toEqual([null, 'A', 'B', 'C', 'D', null, null]);
      expect(result.commit.columns).toEqual(['A', 'B', 'C', 'D']);
      expect(result.commit.deleteColumns).toBeUndefined();
      expect(result.commit.entries.map(function(entry) {
        return entry.data.D;
      })).toEqual(['d1', 'd2']);
    });
  });

  it('sends the column names the grid was loaded with, for the API to check', function() {
    var headers = ['A', 'B', 'C', 'D'];

    return save(headers, rows).then(function(result) {
      expect(result.commit.expectColumns).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  it('removes each empty column when several sit among spare columns', function() {
    var headers = [null, 'A', 'Column (7)', null, 'B', 'C', 'Column (8)', 'D', null];

    return save(headers, rows).then(function(result) {
      expect(result.removed).toEqual(['Column (7)', 'Column (8)']);
      expect(result.grid).toEqual([null, 'A', null, 'B', 'C', 'D', null]);
      expect(result.commit.columns).toEqual(['A', 'B', 'C', 'D']);
      expect(result.commit.deleteColumns).toBeUndefined();
    });
  });

  it('keeps a "Column (n)" that has values', function() {
    var headers = [null, 'A', 'B', 'C', 'D', 'Column (9)'];
    var rowsWithValue = rows.concat([{ A: 'a3', 'Column (9)': 'kept' }]);

    return save(headers, rowsWithValue).then(function(result) {
      expect(result.removed).toEqual([]);
      expect(result.commit.columns).toEqual(['A', 'B', 'C', 'D', 'Column (9)']);
    });
  });
});

describe('loader over the grid during a save (PS-2204)', function() {
  var headers = ['A', 'B'];
  var rows = [{ A: 'a1', B: 'b1' }];

  it('stays up while the commit runs, and until the reload after it renders', function() {
    var seen = [];

    return save(headers, rows, {
      duringCommit: function(context, pageBar, loader) {
        seen.push({ hidden: loader.hidden, text: loader.text });
      },
      commit: function() {
        return new Promise(function(resolve) {
          setTimeout(function() {
            resolve({ clientIds: [] });
          }, 5);
        });
      },
      fetchStarted: function(context, loader) {
        // The reload after the commit starts under the loader
        seen.push({ hidden: loader.hidden, text: loader.text });
      }
    }).then(function(result) {
      // During the commit: up, saying it saves
      expect(seen[0]).toEqual({ hidden: false, text: 'Saving...' });
      // After it, the reload keeps it up until its render takes it down
      expect(seen[1]).toEqual({ hidden: false, text: 'Loading data...' });
      expect(result.loader.hidden).toBe(true);
    });
  });

  it('comes down when the commit fails, so the rows typed can be copied', function() {
    var loaderDuringCommit;

    return save(headers, rows, {
      commit: function() {
        return Promise.reject(new Error('Network error'));
      },
      duringCommit: function(context, pageBar, loader) {
        loaderDuringCommit = loader.hidden;
      }
    }).then(function() {
      throw new Error('The save should have failed');
    }, function(failure) {
      expect(loaderDuringCommit).toBe(false);
      // No status: the server may have applied it (PS-2251)
      expect(failure.kind).toBe('ambiguous');
      expect(failure.error.message).toBe('Network error');
    });
  });
});

describe('page bar during a save (PS-2204)', function() {
  var headers = ['A', 'B'];
  var rows = [{ A: 'a1', B: 'b1' }];

  // Page 2 of a 1,500-row data source, which has a page before and after it
  var largeDataSource = { totalEntries: 1500, currentPage: 1 };

  function pageBarEnabled(pageBar) {
    return pageBar.disabled['[data-page-prev]'] === false
      && pageBar.disabled['[data-page-next]'] === false
      && pageBar.disabled['[data-page-jump]'] === false;
  }

  it('locks page changes while the commit runs, and unlocks them when it succeeds', function() {
    var duringCommit = {};

    return save(headers, rows, Object.assign({
      duringCommit: function(context, pageBar) {
        duringCommit.disabled = Object.assign({}, pageBar.disabled);

        // Next, Previous or the page box while the commit runs
        context.navigateToPage(2);
        context.navigateToPage(0);
        duringCommit.page = context.currentPage;
      }
    }, largeDataSource)).then(function(result) {
      expect(duringCommit.disabled).toEqual({
        '[data-page-prev]': true,
        '[data-page-next]': true,
        '[data-page-jump]': true
      });
      expect(duringCommit.page).toBe(1);

      expect(pageBarEnabled(result.pageBar)).toBe(true);

      result.context.navigateToPage(2);
      expect(result.context.currentPage).toBe(2);
    });
  });

  it('unlocks page changes when the server refuses the commit', function() {
    var context;
    var pageBar;

    return save(headers, rows, Object.assign({
      commit: function() {
        return Promise.reject({ status: 422, responseJSON: { message: 'Invalid' } });
      },
      duringCommit: function(saveContext, saveBar) {
        context = saveContext;
        pageBar = saveBar;
      }
    }, largeDataSource)).then(function() {
      throw new Error('The save should have failed');
    }, function(failure) {
      expect(failure.kind).toBe('definitive');
      expect(pageBarEnabled(pageBar)).toBe(true);

      context.navigateToPage(2);
      expect(context.currentPage).toBe(2);
    });
  });

  it('keeps page changes locked after a commit that may have landed, until a reload (PS-2251)', function() {
    var context;
    var pageBar;

    return save(headers, rows, Object.assign({
      commit: function() {
        return Promise.reject({ status: 504 });
      },
      duringCommit: function(saveContext, saveBar) {
        context = saveContext;
        pageBar = saveBar;
      }
    }, largeDataSource)).then(function() {
      throw new Error('The save should have failed');
    }, function(failure) {
      expect(failure.unconfirmed).toBe(true);
      expect(context.saveLock.needsReload()).toBe(true);
      expect(pageBarEnabled(pageBar)).toBe(false);

      // Another page would replace the rows still to copy
      context.navigateToPage(2);
      expect(context.currentPage).toBe(1);
    });
  });
});
