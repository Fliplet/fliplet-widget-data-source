var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var EntryDiff = require('../js/entry-diff');
var Pagination = require('../js/pagination');

// PS-2204 Problem C: a row added on a paginated page was given an order worked
// out as if the page were the whole data source, so it reloaded near the top of
// page 1 instead of where it was put.
//
// These specs run the whole round trip the manager and the API make: read one
// page (plus the row either side of it) in the platform's read order, build
// the commit payload with EntryDiff, apply it with the API's commit rules, then
// read the data source back and check every row is where the user left it.

var isEqual = function(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
};

// The platform's read order: ORDER BY "order" ASC NULLS LAST, id DESC
function readOrder(rows) {
  return rows.slice().sort(function(a, b) {
    var aNumbered = typeof a.order === 'number';
    var bNumbered = typeof b.order === 'number';

    if (aNumbered && bNumbered && a.order !== b.order) {
      return a.order - b.order;
    }

    if (aNumbered !== bNumbered) {
      return aNumbered ? -1 : 1;
    }

    return b.id - a.id;
  });
}

function makeDataSource(orders) {
  return {
    maxId: orders.length,
    rows: orders.map(function(order, index) {
      return { id: index + 1, order: order, data: { name: 'row ' + (index + 1) } };
    })
  };
}

function names(rows) {
  return rows.map(function(row) {
    return row.data.name;
  });
}

// What fetchCurrentDataSourceEntries caches for a page: the page's rows as
// originals, the grid (getData() carries no order), and the page context.
function loadPage(ds, pageIndex, pageSize) {
  var sorted = readOrder(ds.rows);
  var fetchWindow = Pagination.computeFetchWindow(pageIndex, pageSize);
  var split = Pagination.splitFetchWindow(
    sorted.slice(fetchWindow.offset, fetchWindow.offset + fetchWindow.limit),
    pageIndex,
    pageSize
  );
  var originalMap = {};

  split.rows.forEach(function(row) {
    originalMap[row.id] = { id: row.id, data: Object.assign({}, row.data), order: row.order };
  });

  return {
    sorted: sorted,
    offset: pageIndex * pageSize,
    pageLength: split.rows.length,
    originalMap: originalMap,
    grid: split.rows.map(function(row) {
      return { id: row.id, data: Object.assign({}, row.data) };
    }),
    page: {
      offset: pageIndex * pageSize,
      liveCount: sorted.length,
      before: split.before,
      after: split.after
    }
  };
}

// The API's commit, in its order: renumber every live row (rows this save
// deletes included) in read order, then write entries, then delete.
function commit(ds, payload) {
  if (!Array.isArray(payload.delete)) {
    throw new Error('delete must be an array: the API deletes every row not listed otherwise');
  }

  if (payload.normalizeOrder) {
    readOrder(ds.rows).forEach(function(row, index) {
      row.order = (index + 1) * payload.normalizeOrder.gap;
    });
  }

  payload.entries.forEach(function(entry) {
    var existing = typeof entry.id !== 'undefined' && ds.rows.find(function(row) {
      return row.id === entry.id;
    });

    if (existing) {
      if (typeof entry.order !== 'undefined') {
        existing.order = entry.order;
      }

      existing.data = entry.data;

      return;
    }

    ds.maxId += 1;
    ds.rows.push({
      id: ds.maxId,
      order: typeof entry.order === 'number' ? entry.order : null,
      data: entry.data
    });
  });

  ds.rows = ds.rows.filter(function(row) {
    return payload.delete.indexOf(row.id) === -1;
  });
}

function save(loaded, withPage) {
  var guidCounter = 0;

  return EntryDiff.computeCommitPayload(loaded.grid, loaded.originalMap, {
    // Set by moveRow, as a drag sets the spreadsheet's hasRowsMoved()
    rowsMoved: !!loaded.rowsMoved,
    viewMatchesStoredOrder: true,
    isEqual: isEqual,
    guid: function() {
      return 'guid-' + (++guidCounter);
    },
    page: withPage === false ? null : loaded.page
  });
}

// Drag the row at `from` so it ends up at `to` on the page
function moveRow(loaded, from, to) {
  var row = loaded.grid.splice(from, 1)[0];

  loaded.grid.splice(to, 0, row);
  loaded.rowsMoved = true;
}

// The whole data source as the user left it: the pages they did not touch as
// they were, and the page they edited as it is in the grid.
function expectedNames(loaded) {
  return names(loaded.sorted.slice(0, loaded.offset))
    .concat(names(loaded.grid))
    .concat(names(loaded.sorted.slice(loaded.offset + loaded.pageLength)));
}

function insertRow(loaded, index, name) {
  loaded.grid.splice(index, 0, { data: { name: name } });
}

function positionOf(ds, name) {
  return names(readOrder(ds.rows)).indexOf(name);
}

function range(count, fn) {
  var values = [];
  var i;

  for (i = 0; i < count; i++) {
    values.push(fn(i));
  }

  return values;
}

var SHAPES = {
  'all NULL (SSO / API-created rows)': function(n) {
    return range(n, function() { return null; });
  },
  'spaced, gap 10': function(n) {
    return range(n, function(i) { return (i + 1) * 10; });
  },
  'dense 0..n-1': function(n) {
    return range(n, function(i) { return i; });
  },
  'every order duplicated': function(n) {
    return range(n, function() { return 5; });
  },
  'numbered prefix, then NULLs': function(n) {
    return range(n, function(i) { return i < Math.floor(n / 2) ? i * 10 : null; });
  }
};

describe('PS-2204 Problem C - the reported case: 9,987 rows, all NULL, row added mid page 3', function() {
  var PAGE_SIZE = 500;

  it('without page context (the bug) the row reloads at the top of page 1', function() {
    var ds = makeDataSource(SHAPES['all NULL (SSO / API-created rows)'](9987));
    var loaded = loadPage(ds, 2, PAGE_SIZE);

    insertRow(loaded, 4, 'added');
    commit(ds, save(loaded, false));

    expect(positionOf(ds, 'added') < 500).toBe(true);
  });

  it('with page context the row reloads on page 3, row 5, and nothing else moves', function() {
    var ds = makeDataSource(SHAPES['all NULL (SSO / API-created rows)'](9987));
    var loaded = loadPage(ds, 2, PAGE_SIZE);

    insertRow(loaded, 4, 'added');

    var payload = save(loaded);

    // The renumber is still asked for - the orders cannot seat the row - but
    // the new row is numbered from its place in the whole data source
    expect(payload.normalizeOrder).toEqual({ gap: 1000 });
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].order > 1004 * 1000).toBe(true);
    expect(payload.entries[0].order < 1005 * 1000).toBe(true);

    commit(ds, payload);

    expect(positionOf(ds, 'added')).toBe(1004);
    expect(names(readOrder(ds.rows))).toEqual(expectedNames(loaded));
  });
});

describe('PS-2204 Problem C - where a new row lands, for every stored shape', function() {
  var PAGE_SIZE = 10;
  var ROWS = 47;

  // [label, page index, position on the page, rows to add]
  var CASES = [
    ['middle of page 3', 2, 4, 1],
    ['top of page 3', 2, 0, 1],
    ['bottom of page 3', 2, 10, 1],
    ['top of page 1', 0, 0, 1],
    ['bottom of the last page', 4, 7, 1],
    ['three rows together, middle of page 3', 2, 5, 3],
    ['three rows together, top of page 3', 2, 0, 3],
    ['three rows together, bottom of page 3', 2, 10, 3]
  ];

  Object.keys(SHAPES).forEach(function(shape) {
    CASES.forEach(function(testCase) {
      it(shape + ': ' + testCase[0], function() {
        var ds = makeDataSource(SHAPES[shape](ROWS));
        var loaded = loadPage(ds, testCase[1], PAGE_SIZE);
        var i;

        for (i = 0; i < testCase[3]; i++) {
          insertRow(loaded, testCase[2] + i, 'added ' + i);
        }

        var payload = save(loaded);

        expect(payload.declined.rows).toBe(0);

        commit(ds, payload);

        expect(names(readOrder(ds.rows))).toEqual(expectedNames(loaded));
      });
    });
  });

  it('spaced orders seat a row without a renumber, sending only the new row', function() {
    var ds = makeDataSource(SHAPES['spaced, gap 10'](ROWS));
    var loaded = loadPage(ds, 2, PAGE_SIZE);

    insertRow(loaded, 0, 'added');

    var payload = save(loaded);

    expect(payload.normalizeOrder).toBe(null);
    expect(payload.entries).toHaveLength(1);
    // Between the last row of page 2 (order 200) and the first of page 3 (210)
    expect(payload.entries[0].order > 200).toBe(true);
    expect(payload.entries[0].order < 210).toBe(true);
  });

  it('an unnumbered row below the page does not force a renumber for a row added at the bottom', function() {
    // Page 2 (rows 11-20) is the last numbered page; page 3 starts the NULLs
    var ds = makeDataSource(range(ROWS, function(i) { return i < 20 ? (i + 1) * 10 : null; }));
    var loaded = loadPage(ds, 1, PAGE_SIZE);

    insertRow(loaded, 10, 'added');

    var payload = save(loaded);

    expect(payload.normalizeOrder).toBe(null);

    commit(ds, payload);

    expect(names(readOrder(ds.rows))).toEqual(expectedNames(loaded));
  });

  it('a row added and a row deleted in the same save both land where the user left them', function() {
    var ds = makeDataSource(SHAPES['all NULL (SSO / API-created rows)'](ROWS));
    var loaded = loadPage(ds, 2, PAGE_SIZE);
    var deletedId = loaded.grid[2].id;

    loaded.grid.splice(2, 1);
    insertRow(loaded, 6, 'added');

    var payload = save(loaded);

    expect(payload.delete).toEqual([deletedId]);

    commit(ds, payload);

    expect(names(readOrder(ds.rows))).toEqual(expectedNames(loaded));
  });

  it('a second save made before the reload lands still places against the settled orders', function() {
    var ds = makeDataSource(SHAPES['all NULL (SSO / API-created rows)'](ROWS));
    var loaded = loadPage(ds, 2, PAGE_SIZE);

    insertRow(loaded, 3, 'first');

    var first = save(loaded);

    commit(ds, first);

    // What saveCurrentData caches after the commit, before any reload
    loaded.originalMap = {};
    loaded.grid.forEach(function(entry) {
      var id = entry.id || ds.rows.find(function(row) {
        return row.data.name === entry.data.name;
      }).id;
      var order = Object.prototype.hasOwnProperty.call(first.orders, id)
        ? first.orders[id]
        : first.orders[entry.clientId];

      entry.id = id;
      delete entry.clientId;
      loaded.originalMap[id] = { id: id, data: Object.assign({}, entry.data), order: order };
    });
    loaded.page.before = first.pageEdges.before;
    loaded.page.after = first.pageEdges.after;
    loaded.page.liveCount += 1;
    loaded.pageLength = loaded.grid.length;
    loaded.sorted = readOrder(ds.rows);

    insertRow(loaded, 8, 'second');
    commit(ds, save(loaded));

    expect(names(readOrder(ds.rows))).toEqual(expectedNames(loaded));
  });
});

describe('PS-2204 - a drag on a paginated page, for every stored shape', function() {
  var PAGE_SIZE = 10;
  var ROWS = 47;

  // [label, page index, drags as [from, to], rows added as [position, name]]
  var CASES = [
    ['drag down within page 3', 2, [[2, 7]], []],
    ['drag up within page 3', 2, [[7, 2]], []],
    ['drag the top row of page 3 down', 2, [[0, 5]], []],
    ['drag a row to the top of page 3', 2, [[6, 0]], []],
    ['drag a row to the bottom of page 3', 2, [[3, 9]], []],
    ['drag the bottom row of page 3 up', 2, [[9, 4]], []],
    ['drag a row to the top of page 1', 0, [[5, 0]], []],
    ['drag a row to the bottom of the last page', 4, [[1, 6]], []],
    ['drag, plus a row added in the middle', 2, [[1, 8]], [[4, 'added']]],
    ['drag to the top, plus a row added at the bottom', 2, [[5, 0]], [[10, 'added']]],
    ['drag to the bottom, plus a row added at the top', 2, [[2, 9]], [[0, 'added']]]
  ];

  Object.keys(SHAPES).forEach(function(shape) {
    CASES.forEach(function(testCase) {
      it(shape + ': ' + testCase[0], function() {
        var ds = makeDataSource(SHAPES[shape](ROWS));
        var loaded = loadPage(ds, testCase[1], PAGE_SIZE);

        testCase[2].forEach(function(drag) {
          moveRow(loaded, drag[0], drag[1]);
        });
        testCase[3].forEach(function(insert) {
          insertRow(loaded, insert[0], insert[1]);
        });

        var payload = save(loaded);

        expect(payload.declined.rows).toBe(0);

        commit(ds, payload);

        expect(names(readOrder(ds.rows))).toEqual(expectedNames(loaded));
      });
    });
  });

  it('without page context (the bug) a drag on an unnumbered page 3 lands on page 2', function() {
    var ds = makeDataSource(SHAPES['all NULL (SSO / API-created rows)'](ROWS));
    var loaded = loadPage(ds, 2, PAGE_SIZE);
    var dragged = loaded.grid[1].data.name;

    moveRow(loaded, 1, 6);
    commit(ds, save(loaded, false));

    expect(positionOf(ds, dragged) < 20).toBe(true);
  });
});

describe('PS-2204 - a row just outside the page forces a renumber only when the save touches it', function() {
  // Page 2 of a 12-row data source, page size 4, stored orders 10, 20, 30, 40
  function pageWith(before, after) {
    var originalMap = {};
    var grid = [];

    [10, 20, 30, 40].forEach(function(order, index) {
      var id = index + 1;

      originalMap[id] = { id: id, data: { name: 'row ' + id }, order: order };
      grid.push({ id: id, data: { name: 'row ' + id } });
    });

    return {
      grid: grid,
      originalMap: originalMap,
      page: {
        offset: 4,
        liveCount: 12,
        before: { id: 100, order: before },
        after: { id: 101, order: after }
      }
    };
  }

  // The cases from the review: a tie with an edge row must not renumber a save
  // that writes nothing next to it
  var CASES = [
    ['row added mid-page, row above the page tied', 10, 50, 'insert', null],
    ['row added mid-page, row above the page not tied', 5, 50, 'insert', null],
    ['drag in the middle, row below the page tied', 5, 40, 'drag', null],
    ['drag in the middle, row below the page not tied', 5, 50, 'drag', null],
    ['row added at the top, row above the page tied', 10, 50, 'top', { gap: 1000 }],
    ['row added at the bottom, row below the page tied', 5, 40, 'bottom', { gap: 1000 }],
    ['row added at the top, row above the page not tied', 5, 50, 'top', null],
    ['row added at the bottom, row below the page not tied', 5, 50, 'bottom', null]
  ];

  CASES.forEach(function(testCase) {
    it(testCase[0], function() {
      var loaded = pageWith(testCase[1], testCase[2]);

      if (testCase[3] === 'insert') {
        insertRow(loaded, 2, 'added');
      } else if (testCase[3] === 'drag') {
        moveRow(loaded, 1, 2);
      } else if (testCase[3] === 'top') {
        insertRow(loaded, 0, 'added');
      } else {
        insertRow(loaded, 4, 'added');
      }

      expect(save(loaded).normalizeOrder).toEqual(testCase[4]);
    });
  });

  // A drag that hands the page's first order to another row does touch the row
  // above the page: on a tie, the platform reads the higher id first, so the
  // dragged row would reload on the previous page unless the data source is
  // renumbered.
  function tiedDataSource() {
    var rows = [];
    var i;

    // Page 1: ids 1-9 (orders 10-90), then id 20 (order 100), the edge row
    for (i = 1; i <= 9; i++) {
      rows.push({ id: i, order: i * 10, data: { name: 'row ' + i } });
    }

    rows.push({ id: 20, order: 100, data: { name: 'row 20' } });

    // Page 2: id 11 ties with the edge row (order 100, lower id, so read after
    // it), then ids 21-29 (orders 110-190)
    rows.push({ id: 11, order: 100, data: { name: 'row 11' } });

    for (i = 21; i <= 29; i++) {
      rows.push({ id: i, order: (i - 10) * 10, data: { name: 'row ' + i } });
    }

    // Page 3: ids 30-39
    for (i = 30; i <= 39; i++) {
      rows.push({ id: i, order: (i - 10) * 10, data: { name: 'row ' + i } });
    }

    return { maxId: 39, rows: rows };
  }

  it('a drag to the top of a page whose first row ties with the row above keeps the dragged row on the page', function() {
    var ds = tiedDataSource();
    var loaded = loadPage(ds, 1, 10);

    expect(names(loaded.grid)[0]).toBe('row 11');

    // row 25 has a higher id than the edge row (20), so on a tie it reads first
    moveRow(loaded, 5, 0);

    var payload = save(loaded);

    expect(payload.normalizeOrder).toEqual({ gap: 1000 });

    commit(ds, payload);

    expect(names(readOrder(ds.rows))).toEqual(expectedNames(loaded));
  });

  it('a drag in the middle of that page sends no renumber and keeps every row in place', function() {
    var ds = tiedDataSource();
    var loaded = loadPage(ds, 1, 10);

    moveRow(loaded, 3, 7);

    var payload = save(loaded);

    expect(payload.normalizeOrder).toBe(null);

    commit(ds, payload);

    expect(names(readOrder(ds.rows))).toEqual(expectedNames(loaded));
  });
});

describe('PS-2204 Problem C - random pages, shapes, drags and inserts', function() {
  // Small deterministic PRNG, so a failure reproduces
  function prng(seed) {
    var state = seed;

    return function() {
      state = (state * 1103515245 + 12345) % 2147483648;

      return state / 2147483648;
    };
  }

  it('every row lands where the user left it, across 600 random saves', function() {
    var random = prng(2204);
    var shapeNames = Object.keys(SHAPES);
    var iteration;

    for (iteration = 0; iteration < 600; iteration++) {
      var pageSize = 5 + Math.floor(random() * 8);
      var rowCount = pageSize + 1 + Math.floor(random() * pageSize * 5);
      var shape = shapeNames[Math.floor(random() * shapeNames.length)];
      var ds = makeDataSource(SHAPES[shape](rowCount));
      var pageCount = Math.ceil(rowCount / pageSize);
      var loaded = loadPage(ds, Math.floor(random() * pageCount), pageSize);
      var inserts = 1 + Math.floor(random() * 3);
      var i;

      // Sometimes delete a row in the same save
      if (loaded.grid.length > 1 && random() < 0.3) {
        loaded.grid.splice(Math.floor(random() * loaded.grid.length), 1);
      }

      // Sometimes drag a row in the same save
      if (loaded.grid.length > 1 && random() < 0.4) {
        moveRow(
          loaded,
          Math.floor(random() * loaded.grid.length),
          Math.floor(random() * loaded.grid.length)
        );
      }

      for (i = 0; i < inserts; i++) {
        insertRow(loaded, Math.floor(random() * (loaded.grid.length + 1)), 'added ' + i);
      }

      var payload = save(loaded);

      commit(ds, payload);

      var actual = names(readOrder(ds.rows));
      var expected = expectedNames(loaded);

      if (!isEqual(actual, expected)) {
        throw new Error('iteration ' + iteration + ' (' + shape + ', ' + rowCount + ' rows, page size '
          + pageSize + ', offset ' + loaded.offset + '): expected ' + JSON.stringify(expected)
          + ' got ' + JSON.stringify(actual));
      }

      expect(payload.declined.rows).toBe(0);
    }
  });
});

describe('PS-2204 Problem C - the renumber is sized for the whole data source, not the page', function() {
  it('asks for a gap every live row fits under, even when the page is tiny', function() {
    var MAX_ORDER = 2147483647;
    var liveCount = 3000000;
    var originalMap = {};
    var grid = [];
    var i;

    // One all-NULL page of 10 rows, three million rows into the data source.
    // Unnumbered rows read newest id first, so the grid lists ids descending.
    for (i = 0; i < 10; i++) {
      originalMap[10 - i] = { id: 10 - i, data: { name: 'row ' + (10 - i) }, order: null };
      grid.push({ id: 10 - i, data: { name: 'row ' + (10 - i) } });
    }

    grid.splice(4, 0, { data: { name: 'added' } });

    var payload = EntryDiff.computeCommitPayload(grid, originalMap, {
      rowsMoved: false,
      viewMatchesStoredOrder: true,
      isEqual: isEqual,
      guid: function() {
        return 'guid';
      },
      page: {
        offset: 2000000,
        liveCount: liveCount,
        before: { id: 999, order: null },
        after: { id: 998, order: null }
      }
    });

    var gap = payload.normalizeOrder.gap;

    // 1,000 would run the renumber off the INTEGER column and fail the save
    expect(gap < 1000).toBe(true);
    expect(gap * (liveCount + 1) <= MAX_ORDER).toBe(true);
    // ...and the new row still sits between its neighbours' renumbered orders
    expect(payload.entries[0].order > (2000000 + 4) * gap).toBe(true);
    expect(payload.entries[0].order < (2000000 + 5) * gap).toBe(true);
  });
});

describe('Pagination.computeFetchWindow / splitFetchWindow (PS-2204)', function() {
  it('asks for the row below the first page, and the rows either side of any other', function() {
    expect(Pagination.computeFetchWindow(0, 500)).toEqual({ offset: 0, limit: 501 });
    expect(Pagination.computeFetchWindow(2, 500)).toEqual({ offset: 999, limit: 502 });
  });

  it('splits the window into the page and its edge rows', function() {
    var rows = range(12, function(i) { return { id: 100 - i, order: i === 0 ? null : i }; });
    var split = Pagination.splitFetchWindow(rows, 1, 10);

    expect(split.rows).toHaveLength(10);
    expect(split.rows[0].id).toBe(99);
    expect(split.before).toEqual({ id: 100, order: null });
    expect(split.after).toEqual({ id: 89, order: 11 });
  });

  it('has no edge row past either end of the data source', function() {
    var rows = range(4, function(i) { return { id: i + 1, order: i }; });

    expect(Pagination.splitFetchWindow(rows, 0, 10)).toEqual({ rows: rows, before: null, after: null });

    var lastPage = Pagination.splitFetchWindow(rows, 1, 3);

    expect(lastPage.rows).toHaveLength(3);
    expect(lastPage.before).toEqual({ id: 1, order: 0 });
    expect(lastPage.after).toBe(null);
  });
});
