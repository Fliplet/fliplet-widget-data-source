// PS-2313: interface.js's side of the server-side search - the Find box hook,
// the filtered fetch, and the commit from a grid showing matches
var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var SearchFilter = require('../js/search-filter');
var SaveState = require('../js/save-state');
var Pagination = require('../js/pagination');

var interfaceSource = fs.readFileSync(path.join(__dirname, '../js/interface.js'), 'utf8');

function wait() {
  return new Promise(function(resolve) {
    setTimeout(resolve, 5);
  });
}

// Cuts the function that starts at `marker` out of the source by brace-counting,
// as interface.js needs Fliplet/jQuery globals and can't be required here
function extractFunction(source, marker) {
  var startIndex = source.indexOf(marker);

  if (startIndex === -1) {
    throw new Error('Could not find ' + marker + ' in source');
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

  throw new Error('Could not find the end of ' + marker);
}

/**
 * The real getCommitPayload with an EntryDiff that records what it was given
 * @param {String} searchTerm - The active server-side search term
 * @param {Object} [diffResult] - What the stubbed EntryDiff returns (default {})
 * @returns {Object} The options passed to EntryDiff.computeCommitPayload
 */
function commitOptions(searchTerm, diffResult) {
  return runCommitPayload(searchTerm, diffResult).options;
}

/**
 * Run the real getCommitPayload once
 * @param {String} searchTerm - The active server-side search term
 * @param {Object} [diffResult] - What the stubbed EntryDiff returns (default {})
 * @returns {Object} { options, payload }
 */
function runCommitPayload(searchTerm, diffResult) {
  var received = null;

  var context = {
    EntryDiff: {
      computeCommitPayload: function(entries, original, options) {
        received = options;

        return diffResult || {};
      }
    },
    entryMap: { original: {} },
    table: {
      hasRowsMoved: function() {
        return false;
      },
      isColumnSorted: function() {
        return false;
      }
    },
    searchTerm: searchTerm,
    pageEdges: null,
    totalEntries: 1500,
    _: { isEqual: function() {} },
    Fliplet: { guid: function() {} }
  };

  vm.createContext(context);
  vm.runInContext(extractFunction(interfaceSource, 'function getCommitPayload(') + '\nvar result = getCommitPayload([]);', context);

  return { options: received, payload: context.result };
}

describe('getCommitPayload under a server-side search (PS-2313)', function() {
  it('tells EntryDiff the view is not the stored order while a term is active', function() {
    expect(commitOptions('smith').viewMatchesStoredOrder).toBe(false);
  });

  it('keeps the stored-order view when there is no term and no column sort', function() {
    expect(commitOptions('').viewMatchesStoredOrder).toBe(true);
  });

  it('marks rows declined under a search as searched, so the notice does not blame a sort', function() {
    var payload = runCommitPayload('smith', { declined: { sorted: true, rows: 1 } }).payload;

    expect(payload.declined.searched).toBe(true);
    expect(payload.declined.rows).toBe(1);
  });

  it('leaves the declined block alone when no search is active', function() {
    var payload = runCommitPayload('', { declined: { sorted: true, rows: 1 } }).payload;

    expect(payload.declined.searched).toBeUndefined();
    expect(payload.declined.sorted).toBe(true);
  });

  it('copes with a payload that has no declined block', function() {
    expect(runCommitPayload('smith', {}).payload.declined).toBeUndefined();
  });
});

/**
 * The real applySearchFilter over recorders for the fetch, the grid search,
 * the Find box and the reload alert
 * @param {Object} options - totalEntries, searchTerm, currentPage, needsReload, fetchFails
 * @returns {Object} The context (searchTerm, currentPage) and what was called
 */
function searchHarness(options) {
  var calls = { fetch: [], search: [], alerts: 0, box: null };

  var context = {
    totalEntries: options.totalEntries,
    PAGE_SIZE: 500,
    searchTerm: options.searchTerm || '',
    currentPage: options.currentPage || 0,
    table: null,
    saveLock: {
      isInFlight: function() {
        return false;
      },
      needsReload: function() {
        return !!options.needsReload;
      }
    },
    $: function(selector) {
      return {
        val: function(value) {
          if (selector === '#search-field') {
            calls.box = value;
          }
        }
      };
    },
    // Copied out of the vm realm so deepStrictEqual can compare them
    search: function(action, searchOptions) {
      calls.search.push([action, Object.assign({}, searchOptions)]);
    },
    alertReloadFirst: function() {
      calls.alerts++;
    },
    showGridLoader: function() {},
    updatePaginationControls: function() {},
    fetchCurrentDataSourceEntries: function(entries, fetchOptions) {
      calls.fetch.push(Object.assign({}, fetchOptions));

      return options.fetchFails ? Promise.reject(new Error('down')) : Promise.resolve();
    }
  };

  vm.createContext(context);
  vm.runInContext(extractFunction(interfaceSource, 'function applySearchFilter('), context);

  return {
    context: context,
    calls: calls,
    apply: function(term) {
      return context.applySearchFilter(term);
    }
  };
}

describe('applySearchFilter (PS-2313)', function() {
  var forcedFind = { force: true, selectCell: false, focusSearch: false };

  it('leaves a data source that fits in a page to the grid search', function() {
    var harness = searchHarness({ totalEntries: 400 });

    expect(harness.apply('smith')).toBe(false);
    expect(harness.calls.fetch).toEqual([]);
  });

  it('does nothing for the term the grid already shows', function() {
    var harness = searchHarness({ totalEntries: 1500, searchTerm: 'smith' });

    expect(harness.apply('smith')).toBe(false);
    expect(harness.calls.fetch).toEqual([]);
  });

  it('asks for a reload first when one is pending, keeping the current term', function() {
    var harness = searchHarness({ totalEntries: 1500, searchTerm: 'old', needsReload: true });

    expect(harness.apply('smith')).toBe(true);
    expect(harness.calls.alerts).toBe(1);
    expect(harness.calls.fetch).toEqual([]);
    expect(harness.calls.box).toBe('old');
    expect(harness.calls.search).toEqual([['find', forcedFind]]);
    expect(harness.context.searchTerm).toBe('old');
  });

  it('searches from the first page and asks the fetch to report failure', function() {
    var harness = searchHarness({ totalEntries: 1500, searchTerm: 'old', currentPage: 2 });

    expect(harness.apply('smith')).toBe(true);
    expect(harness.context.searchTerm).toBe('smith');
    expect(harness.context.currentPage).toBe(0);
    expect(harness.calls.fetch).toEqual([{ rejectOnError: true }]);
  });

  it('puts the previous term and page back when the search fails', function() {
    var harness = searchHarness({ totalEntries: 1500, searchTerm: 'old', currentPage: 2, fetchFails: true });

    harness.apply('smith');

    return wait().then(function() {
      expect(harness.context.searchTerm).toBe('old');
      expect(harness.context.currentPage).toBe(2);
      expect(harness.calls.box).toBe('old');
      expect(harness.calls.search).toEqual([['find', forcedFind]]);
    });
  });
});

/**
 * The real fetchCurrentDataSourceEntries against a stubbed API that records
 * the query body it is sent
 * @param {Object} options - searchTerm, totalEntries, columns
 * @returns {Promise} Resolves with { context, queries } once the fetch settles
 */
function runFetch(options) {
  var queries = [];
  // Any jQuery chain is a no-op
  var chain = new Proxy({}, {
    get: function() {
      return function() {
        return chain;
      };
    }
  });

  var context = {
    STALE_FETCH: { stale: true },
    FETCH_ERROR_MESSAGE: 'Error loading data source.',
    saveLock: {
      beginReload: function() {
        return 1;
      }
    },
    fetchGeneration: 0,
    currentDataSourceId: 1,
    currentDataSource: {},
    currentDataSourceUpdatedAt: null,
    currentDataSourceRowsCount: 0,
    currentDataSourceColumnsCount: 0,
    columns: [],
    totalEntries: 0,
    PAGE_SIZE: 500,
    currentPage: 0,
    lastRenderedPage: 0,
    searchTerm: options.searchTerm,
    filteredTotal: 7,
    pageEdges: null,
    dataSourceIsLive: false,
    initialLoad: false,
    table: null,
    showingDemoData: false,
    demoColumns: false,
    DEMO_ROW_COUNT: 2,
    DEMO_ROW_DATA: {},
    locale: 'en',
    TD: function() {
      return '';
    },
    $sourceContents: chain,
    $: function() {
      return chain;
    },
    _: {
      times: function(count, fn) {
        var out = [];

        for (var i = 0; i < count; i++) {
          out.push(fn(i));
        }

        return out;
      },
      keys: Object.keys,
      uniq: function(list) {
        return list.filter(function(item, index) {
          return list.indexOf(item) === index;
        });
      },
      concat: function(a, b) {
        return a.concat(b);
      }
    },
    SearchFilter: SearchFilter,
    SaveState: SaveState,
    Pagination: Pagination,
    showGridLoader: function() {},
    hideGridLoader: function() {},
    clearLiveDataTimer: function() {},
    cacheOriginalEntries: function() {},
    renderSpreadsheet: function() {},
    updatePaginationControls: function() {},
    setTimeout: function(fn) {
      fn();
    },
    Fliplet: {
      DataSources: {
        connect: function() {
          return Promise.resolve({});
        }
      },
      API: {
        request: function(request) {
          if (request.method === 'POST') {
            // Copied out of the vm realm so deepStrictEqual can compare it
            queries.push(JSON.parse(JSON.stringify(request.data)));

            return Promise.resolve({ entries: [], pagination: { total: 3 } });
          }

          return Promise.resolve({
            dataSource: { name: 'People', columns: options.columns, entriesCount: options.totalEntries }
          });
        }
      }
    }
  };

  vm.createContext(context);

  var fetched = vm.runInContext(
    extractFunction(interfaceSource, 'function fetchCurrentDataSourceEntries(') + '\nfetchCurrentDataSourceEntries();',
    context
  );

  return fetched.then(function() {
    return { context: context, queries: queries };
  });
}

describe('fetchCurrentDataSourceEntries with a Find term (PS-2313)', function() {
  it('sends the term as a where over the columns, paged from the match count', function() {
    return runFetch({ searchTerm: 'smith', totalEntries: 1500, columns: ['Name'] }).then(function(result) {
      expect(result.queries).toEqual([{
        where: { $or: [{ Name: { $iLike: 'smith' } }] },
        limit: 500,
        offset: 0,
        order: [['order', 'ASC'], ['id', 'DESC']],
        includePagination: true
      }]);
      expect(result.context.searchTerm).toBe('smith');
      expect(result.context.filteredTotal).toBe(3);
    });
  });

  it('drops the term when the data source has shrunk to a page', function() {
    return runFetch({ searchTerm: 'smith', totalEntries: 400, columns: ['Name'] }).then(function(result) {
      expect(result.queries.length).toBe(1);
      expect(result.queries[0].where).toBeUndefined();
      expect(result.context.searchTerm).toBe('');
      expect(result.context.filteredTotal).toBe(null);
    });
  });

  it('drops the term when no column can match it', function() {
    return runFetch({ searchTerm: 'smith', totalEntries: 1500, columns: ['$meta'] }).then(function(result) {
      expect(result.queries.length).toBe(1);
      expect(result.queries[0].where).toBeUndefined();
      expect(result.context.searchTerm).toBe('');
      expect(result.context.filteredTotal).toBe(null);
    });
  });
});
