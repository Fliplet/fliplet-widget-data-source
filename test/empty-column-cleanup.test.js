var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var Pagination = require('../js/pagination');

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
 * Runs the widget's saveCurrentData against a grid whose header row is
 * `headers`, in the order the columns are shown (null for a column without a
 * name). The grid removes columns the way HOT 0.38's alter('remove_col') does:
 * by visual index. A saved column the save removes from the grid is reported
 * as deleted, as js/column-changes.js does.
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
          options.duringCommit(context, pageBar);
        }

        return options.commit ? options.commit() : Promise.resolve({ clientIds: [] });
      }
    },
    commitRunning: false,
    currentPage: options.currentPage || 0,
    totalPages: 1,
    Pagination: Pagination,
    $: function(selector) {
      if (selector === '.pagination-controls') {
        return pageBar;
      }

      if (selector === '[data-page-prev], [data-page-next], [data-page-jump]') {
        return pageBar.all;
      }

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
        }
      };
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
      }
    },
    Promise: Promise,
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
    'saveCurrentData'
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

  it('stays up while the commit runs, even when the reload started by the save shows its rows', function() {
    var seen = [];

    return save(headers, rows, {
      commit: function() {
        return new Promise(function(resolve) {
          setTimeout(function() {
            resolve({ clientIds: [] });
          }, 5);
        });
      },
      fetchStarted: function(context, loader) {
        // The reload at the start of the save renders while the commit runs
        // (renderSpreadsheet calls hideGridLoader); the reload after it checks
        // the loader is still up as the saved rows load
        setTimeout(function() {
          context.hideGridLoader();
          seen.push({ hidden: loader.hidden, text: loader.text, commitRunning: context.commitRunning });
        }, 0);
      }
    }).then(function(result) {
      return new Promise(function(resolve) {
        setTimeout(resolve, 10);
      }).then(function() {
        // During the commit: still up, saying it saves
        expect(seen[0]).toEqual({ hidden: false, text: 'Saving...', commitRunning: true });
        // After it, the reload's render takes it down
        expect(seen[1]).toEqual({ hidden: true, text: 'Loading data...', commitRunning: false });
        expect(result.loader.hidden).toBe(true);
      });
    });
  });

  it('comes down when the commit fails', function() {
    var loaderAfterFailure;

    return save(headers, rows, {
      commit: function() {
        return Promise.reject(new Error('Network error'));
      },
      fetchStarted: function(context, loader) {
        loaderAfterFailure = loader;
      }
    }).then(function() {
      throw new Error('The save should have failed');
    }, function(error) {
      expect(error.message).toBe('Network error');
      expect(loaderAfterFailure.hidden).toBe(true);
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

  it('unlocks page changes when the commit fails', function() {
    var context;
    var pageBar;

    return save(headers, rows, Object.assign({
      commit: function() {
        return Promise.reject(new Error('Network error'));
      },
      duringCommit: function(saveContext, saveBar) {
        context = saveContext;
        pageBar = saveBar;
      }
    }, largeDataSource)).then(function() {
      throw new Error('The save should have failed');
    }, function(error) {
      expect(error.message).toBe('Network error');
      expect(pageBarEnabled(pageBar)).toBe(true);

      context.navigateToPage(2);
      expect(context.currentPage).toBe(2);
    });
  });
});
