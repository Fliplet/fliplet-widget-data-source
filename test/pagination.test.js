/* eslint-env jest */
var Pagination = require('../js/pagination');

describe('Pagination.computePageInfo', function() {
  var PAGE_SIZE = 500;

  it('returns correct info for first page of a large data source', function() {
    var info = Pagination.computePageInfo(2500, PAGE_SIZE, 0);

    expect(info.currentPage).toBe(0);
    expect(info.totalPages).toBe(5);
    expect(info.startEntry).toBe(1);
    expect(info.endEntry).toBe(500);
    expect(info.hasPrev).toBe(false);
    expect(info.hasNext).toBe(true);
    expect(info.offset).toBe(0);
    expect(info.limit).toBe(500);
  });

  it('returns correct info for a middle page', function() {
    var info = Pagination.computePageInfo(2500, PAGE_SIZE, 2);

    expect(info.currentPage).toBe(2);
    expect(info.startEntry).toBe(1001);
    expect(info.endEntry).toBe(1500);
    expect(info.hasPrev).toBe(true);
    expect(info.hasNext).toBe(true);
    expect(info.offset).toBe(1000);
  });

  it('returns correct info for the last page', function() {
    var info = Pagination.computePageInfo(2500, PAGE_SIZE, 4);

    expect(info.currentPage).toBe(4);
    expect(info.startEntry).toBe(2001);
    expect(info.endEntry).toBe(2500);
    expect(info.hasPrev).toBe(true);
    expect(info.hasNext).toBe(false);
  });

  it('handles partial last page correctly', function() {
    var info = Pagination.computePageInfo(1750, PAGE_SIZE, 3);

    expect(info.totalPages).toBe(4);
    expect(info.startEntry).toBe(1501);
    expect(info.endEntry).toBe(1750);
    expect(info.hasNext).toBe(false);
  });

  it('clamps page when current page exceeds total pages', function() {
    // e.g. user deletes entries and the last page no longer exists
    var info = Pagination.computePageInfo(400, PAGE_SIZE, 5);

    expect(info.currentPage).toBe(0);
    expect(info.totalPages).toBe(1);
    expect(info.startEntry).toBe(1);
    expect(info.endEntry).toBe(400);
    expect(info.hasPrev).toBe(false);
    expect(info.hasNext).toBe(false);
  });

  it('clamps negative page to 0', function() {
    var info = Pagination.computePageInfo(1000, PAGE_SIZE, -3);

    expect(info.currentPage).toBe(0);
  });

  it('handles empty data source (0 entries)', function() {
    var info = Pagination.computePageInfo(0, PAGE_SIZE, 0);

    expect(info.currentPage).toBe(0);
    expect(info.totalPages).toBe(1);
    expect(info.startEntry).toBe(0);
    expect(info.endEntry).toBe(0);
    expect(info.hasPrev).toBe(false);
    expect(info.hasNext).toBe(false);
  });

  it('handles single entry', function() {
    var info = Pagination.computePageInfo(1, PAGE_SIZE, 0);

    expect(info.totalPages).toBe(1);
    expect(info.startEntry).toBe(1);
    expect(info.endEntry).toBe(1);
    expect(info.hasNext).toBe(false);
  });

  it('handles exactly one page of entries', function() {
    var info = Pagination.computePageInfo(500, PAGE_SIZE, 0);

    expect(info.totalPages).toBe(1);
    expect(info.startEntry).toBe(1);
    expect(info.endEntry).toBe(500);
    expect(info.hasNext).toBe(false);
  });

  it('handles exactly one more than a page', function() {
    var info = Pagination.computePageInfo(501, PAGE_SIZE, 0);

    expect(info.totalPages).toBe(2);
    expect(info.hasNext).toBe(true);

    var page2 = Pagination.computePageInfo(501, PAGE_SIZE, 1);

    expect(page2.startEntry).toBe(501);
    expect(page2.endEntry).toBe(501);
    expect(page2.hasNext).toBe(false);
  });

  it('handles 15000+ entries (PS-1781 scenario)', function() {
    var info = Pagination.computePageInfo(15234, PAGE_SIZE, 0);

    expect(info.totalPages).toBe(31);
    expect(info.startEntry).toBe(1);
    expect(info.endEntry).toBe(500);
    expect(info.hasNext).toBe(true);

    var lastPage = Pagination.computePageInfo(15234, PAGE_SIZE, 30);

    expect(lastPage.startEntry).toBe(15001);
    expect(lastPage.endEntry).toBe(15234);
    expect(lastPage.hasNext).toBe(false);
    expect(lastPage.offset).toBe(15000);
  });
});

describe('Pagination.computeCommitPayload', function() {
  var guidCounter;
  var mockGuid = function() { return 'guid-' + (++guidCounter); };
  var deepEqual = function(a, b) { return JSON.stringify(a) === JSON.stringify(b); };

  beforeEach(function() {
    guidCounter = 0;
  });

  it('detects no changes when entries match originals', function() {
    var originals = {
      1: { id: 1, data: { name: 'Alice' }, order: 0 },
      2: { id: 2, data: { name: 'Bob' }, order: 1 }
    };
    var entries = [
      { id: 1, data: { name: 'Alice' }, order: 0 },
      { id: 2, data: { name: 'Bob' }, order: 1 }
    ];

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
    expect(payload.delete).toHaveLength(0);
  });

  it('detects updated entries', function() {
    var originals = {
      1: { id: 1, data: { name: 'Alice' }, order: 0 }
    };
    var entries = [
      { id: 1, data: { name: 'Alice Updated' }, order: 0 }
    ];

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].data.name).toBe('Alice Updated');
    expect(payload.delete).toHaveLength(0);
  });

  it('detects deleted entries', function() {
    var originals = {
      1: { id: 1, data: { name: 'Alice' }, order: 0 },
      2: { id: 2, data: { name: 'Bob' }, order: 1 }
    };
    var entries = [
      { id: 1, data: { name: 'Alice' }, order: 0 }
      // Bob is missing — deleted
    ];

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
    expect(payload.delete).toEqual([2]);
  });

  it('detects inserted entries (no id)', function() {
    var originals = {};
    var entries = [
      { data: { name: 'New Entry' } }
    ];

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].clientId).toBe('guid-1');
    expect(payload.entries[0].data.name).toBe('New Entry');
    expect(payload.delete).toHaveLength(0);
  });

  it('treats entries with unknown IDs as inserts', function() {
    var originals = {
      1: { id: 1, data: { name: 'Alice' }, order: 0 }
    };
    var entries = [
      { id: 1, data: { name: 'Alice' }, order: 0 },
      { id: 999, data: { name: 'Unknown' } } // ID not in originals
    ];

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    // The unknown-ID entry should be treated as an insert
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].clientId).toBe('guid-1');
    expect(payload.entries[0].id).toBeUndefined();
    expect(payload.delete).toHaveLength(0);
  });

  it('handles mixed insert, update, and delete', function() {
    var originals = {
      1: { id: 1, data: { name: 'Alice' }, order: 0 },
      2: { id: 2, data: { name: 'Bob' }, order: 1 },
      3: { id: 3, data: { name: 'Charlie' }, order: 2 }
    };
    var entries = [
      { id: 1, data: { name: 'Alice' }, order: 0 },       // unchanged
      { id: 2, data: { name: 'Bob Updated' }, order: 1 },  // updated
      // Charlie deleted
      { data: { name: 'New Person' } }                      // inserted
    ];

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    // updated (Bob) + inserted (New Person) = 2
    expect(payload.entries).toHaveLength(2);
    expect(payload.delete).toEqual([3]);
  });

  it('handles empty entries and empty originals', function() {
    var payload = Pagination.computeCommitPayload([], {}, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
    expect(payload.delete).toHaveLength(0);
  });

  it('handles null entries gracefully', function() {
    var payload = Pagination.computeCommitPayload(null, {}, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
    expect(payload.delete).toHaveLength(0);
  });
});

describe('Pagination.resolveEntryOrder — unit', function() {
  var PAGE_SIZE = 500;

  it('gives a brand-new row (no id) a page-correct rank+offset value, no reorder', function() {
    var entries = [{ data: { name: 'New' }, order: 0 }];

    Pagination.resolveEntryOrder(entries, {}, 1, PAGE_SIZE, false);

    expect(entries[0].order).toBe(500);
  });

  it('without a reorder, restores an untouched row\'s true order exactly, discarding the rank-derived value', function() {
    var originals = { 1: { id: 1, order: 5000 } };
    var entries = [{ id: 1, order: 0 }]; // getData()'s rank-derived value, page-local

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE, false);

    expect(entries[0].order).toBe(5000);
  });

  it('with a real reorder signal, gives every known row a fresh rank+offset value instead', function() {
    var originals = { 1: { id: 1, order: 5000 } };
    var entries = [{ id: 1, order: 0 }];

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE, true);

    expect(entries[0].order).toBe(500); // rank 0 + page offset 500, not the preserved 5000
  });

  it('a brand-new row gets the same rank+offset value whether or not a reorder happened', function() {
    var entriesNoReorder = [{ data: {}, order: 0 }];
    var entriesReorder = [{ data: {}, order: 0 }];

    Pagination.resolveEntryOrder(entriesNoReorder, {}, 2, PAGE_SIZE, false);
    Pagination.resolveEntryOrder(entriesReorder, {}, 2, PAGE_SIZE, true);

    expect(entriesNoReorder[0].order).toBe(1000);
    expect(entriesReorder[0].order).toBe(1000);
  });

  it('mutates entries in place and also returns them', function() {
    var originals = { 1: { id: 1, order: 5 } };
    var entries = [{ id: 1, order: 0 }];
    var result = Pagination.resolveEntryOrder(entries, originals, 0, PAGE_SIZE, false);

    expect(result).toBe(entries);
    expect(entries[0].order).toBe(5);
  });

  it('handles null/empty entries and a missing originalMap gracefully', function() {
    expect(Pagination.resolveEntryOrder([], {}, 1, PAGE_SIZE, false)).toEqual([]);
    expect(Pagination.resolveEntryOrder(null, {}, 1, PAGE_SIZE, false)).toEqual([]);
    expect(Pagination.resolveEntryOrder([{ data: {}, order: 0 }], undefined, 1, PAGE_SIZE, false)[0].order).toBe(500);
  });
});

describe('Pagination.resolveEntryOrder + computeCommitPayload — the PS-2072 Critical, reproduced and fixed', function() {
  var guidCounter;
  var mockGuid = function() { return 'guid-' + (++guidCounter); };
  var deepEqual = function(a, b) { return JSON.stringify(a) === JSON.stringify(b); };
  var PAGE_SIZE = 500;

  beforeEach(function() {
    guidCounter = 0;
  });

  // Mirrors the review's own evidence table: page 2, no reorder, no edit —
  // three shapes of the *real* stored order.

  it('dense originals (500..999), no reorder, no edit -> 0 rows flagged (this always worked)', function() {
    var originals = {};
    var entries = [];

    for (var i = 0; i < 5; i++) {
      originals[500 + i] = { id: 500 + i, data: { name: 'Row' + i }, order: 500 + i };
      entries.push({ id: 500 + i, data: { name: 'Row' + i }, order: i });
    }

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE, false);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
  });

  it('NULL originals (SSO/API-created rows), no reorder, no edit -> 0 rows flagged (was 500/500 — the original Critical)', function() {
    var originals = {};
    var entries = [];

    for (var i = 0; i < 5; i++) {
      originals[900 + i] = { id: 900 + i, data: { name: 'Row' + i }, order: null };
      entries.push({ id: 900 + i, data: { name: 'Row' + i }, order: i });
    }

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE, false);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
    entries.forEach(function(entry) { expect(entry.order).toBeNull(); });
  });

  it('sparse originals, gap=10, no reorder, no edit -> 0 rows flagged (was 500/500 — the original Critical)', function() {
    var originals = {};
    var entries = [];

    for (var i = 0; i < 5; i++) {
      originals[700 + i] = { id: 700 + i, data: { name: 'Row' + i }, order: 5000 + (i * 10) };
      entries.push({ id: 700 + i, data: { name: 'Row' + i }, order: i });
    }

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE, false);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
  });

  it('duplicate originals, no reorder, no edit -> 0 rows flagged', function() {
    var originals = {
      1: { id: 1, data: { name: 'A' }, order: 500 },
      2: { id: 2, data: { name: 'B' }, order: 500 }, // duplicate of row 1's order
      3: { id: 3, data: { name: 'C' }, order: 501 }
    };
    var entries = [
      { id: 1, data: { name: 'A' }, order: 0 },
      { id: 2, data: { name: 'B' }, order: 1 },
      { id: 3, data: { name: 'C' }, order: 2 }
    ];

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE, false);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
  });

  it('one row edited on a page of NULL-order rows, no reorder -> only that row is flagged, with its own order preserved', function() {
    var originals = {
      901: { id: 901, data: { name: 'Keep' }, order: null },
      902: { id: 902, data: { name: 'EditMe' }, order: null },
      903: { id: 903, data: { name: 'AlsoKeep' }, order: null }
    };
    var entries = [
      { id: 901, data: { name: 'Keep' }, order: 0 },
      { id: 902, data: { name: 'EditMe CHANGED' }, order: 1 },
      { id: 903, data: { name: 'AlsoKeep' }, order: 2 }
    ];

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE, false);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].id).toBe(902);
    expect(payload.entries[0].data.name).toBe('EditMe CHANGED');
    expect(payload.entries[0].order).toBeNull(); // preserved, not rewritten to a rank value
  });

  it('a brand-new row inserted on page 3, no reorder -> gets a page-correct value, not a 0-based one', function() {
    var originals = {};
    var entries = [{ data: { name: 'Brand new' }, order: 0 }];

    Pagination.resolveEntryOrder(entries, originals, 2, PAGE_SIZE, false);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].order).toBe(1000);
  });

  it('deleting a row on a NULL-order page, no reorder -> unaffected, kept rows still preserve their order', function() {
    var originals = {
      901: { id: 901, data: { name: 'Keep' }, order: null },
      902: { id: 902, data: { name: 'Delete' }, order: null }
    };
    var entries = [
      { id: 901, data: { name: 'Keep' }, order: 0 }
      // 902 missing — deleted
    ];

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE, false);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.delete).toEqual([902]);
    expect(payload.entries).toHaveLength(0);
  });

  it('page 1 (offset 0), no reorder -> behaves identically to before for the dense case', function() {
    var originals = { 1: { id: 1, data: { name: 'Row1' }, order: 0 } };
    var entries = [{ id: 1, data: { name: 'Row1 EDITED' }, order: 0 }];

    Pagination.resolveEntryOrder(entries, originals, 0, PAGE_SIZE, false);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].order).toBe(0);
  });

  // Follow-up review findings (on commit ddaed13/b48170d): the *previous*
  // value-inference design silently dropped a reorder on an all-tied page,
  // and could round-trip a tied redistribution pool in the wrong order on
  // reload (falls back to `id ASC`, which doesn't always match the drag).
  // These reproduce both exactly, with a real didReorder=true signal.

  it('FOLLOW-UP FIX: a genuine reorder on a tied-order page round-trips exactly as dragged (was: id ASC tiebreak, wrong)', function() {
    // Reviewer's own failing case: stored 1(500) 2(500) 3(501), user drags
    // the page to visual order [3, 1, 2].
    var originals = {
      1: { id: 1, data: { name: 'A' }, order: 500 },
      2: { id: 2, data: { name: 'B' }, order: 500 },
      3: { id: 3, data: { name: 'C' }, order: 501 }
    };
    var entries = [
      { id: 3, data: { name: 'C' }, order: 0 }, // dragged to visually first
      { id: 1, data: { name: 'A' }, order: 1 },
      { id: 2, data: { name: 'B' }, order: 2 }
    ];

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE, true);

    // Simulate the API's reload: ORDER BY order ASC, id ASC.
    var reloaded = entries.slice().sort(function(a, b) {
      return (a.order - b.order) || (a.id - b.id);
    });

    expect(reloaded.map(function(e) { return e.id; })).toEqual([3, 1, 2]);

    // And every value is pairwise distinct — no tie left to break.
    var orders = entries.map(function(e) { return e.order; });
    var uniqueOrders = orders.filter(function(value, index) {
      return orders.indexOf(value) === index;
    });

    expect(uniqueOrders.length).toBe(orders.length);
  });

  it('FOLLOW-UP FIX: a genuine reorder on an all-NULL page actually persists (was: silently discarded as "unchanged")', function() {
    var originals = {
      1: { id: 1, data: { name: 'A' }, order: null },
      2: { id: 2, data: { name: 'B' }, order: null },
      3: { id: 3, data: { name: 'C' }, order: null }
    };
    var entries = [
      { id: 3, data: { name: 'C' }, order: 0 },
      { id: 1, data: { name: 'A' }, order: 1 },
      { id: 2, data: { name: 'B' }, order: 2 }
    ];

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE, true);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    // All three now carry a real order and are correctly flagged as updated —
    // the drag reaches the commit payload instead of vanishing.
    expect(payload.entries).toHaveLength(3);
    payload.entries.forEach(function(entry) {
      expect(typeof entry.order).toBe('number');
    });

    var reloaded = entries.slice().sort(function(a, b) {
      return (a.order - b.order) || (a.id - b.id);
    });

    expect(reloaded.map(function(e) { return e.id; })).toEqual([3, 1, 2]);
  });

  it('without didReorder, a tied/NULL page stays exactly as it was (no false-positive renumbering)', function() {
    var originals = {
      1: { id: 1, data: { name: 'A' }, order: null },
      2: { id: 2, data: { name: 'B' }, order: null },
      3: { id: 3, data: { name: 'C' }, order: null }
    };
    var entries = [
      { id: 1, data: { name: 'A' }, order: 0 },
      { id: 2, data: { name: 'B' }, order: 1 },
      { id: 3, data: { name: 'C' }, order: 2 }
    ];

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE, false);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
  });
});

describe('Pagination.resolveFetchErrorRecovery', function() {
  it('does not recover on a stale error — a newer fetch already owns the state', function() {
    var result = Pagination.resolveFetchErrorRecovery(true, 3);

    expect(result.shouldRecover).toBe(false);
  });

  it('rolls back to the page actually on screen on a real failure', function() {
    var result = Pagination.resolveFetchErrorRecovery(false, 2);

    expect(result.shouldRecover).toBe(true);
    expect(result.currentPage).toBe(2);
    expect(result.lastRenderedPage).toBe(2);
  });

  it('is a no-op rollback when the page that failed is the page already on screen', function() {
    // e.g. a save-triggered refetch of the current page that fails
    var result = Pagination.resolveFetchErrorRecovery(false, 0);

    expect(result.currentPage).toBe(0);
  });
});
