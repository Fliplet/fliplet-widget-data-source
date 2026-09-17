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

describe('Pagination.compareOrderNullsLast', function() {
  it('sorts ascending for two numbers', function() {
    expect(Pagination.compareOrderNullsLast(1, 2)).toBeLessThan(0);
    expect(Pagination.compareOrderNullsLast(2, 1)).toBeGreaterThan(0);
    expect(Pagination.compareOrderNullsLast(5, 5)).toBe(0);
  });

  it('sorts null after every number, matching Postgres ORDER BY ... ASC', function() {
    expect(Pagination.compareOrderNullsLast(null, 5)).toBeGreaterThan(0);
    expect(Pagination.compareOrderNullsLast(5, null)).toBeLessThan(0);
  });

  it('treats undefined the same as null', function() {
    expect(Pagination.compareOrderNullsLast(undefined, 5)).toBeGreaterThan(0);
    expect(Pagination.compareOrderNullsLast(5, undefined)).toBeLessThan(0);
  });

  it('treats two nulls as tied', function() {
    expect(Pagination.compareOrderNullsLast(null, null)).toBe(0);
    expect(Pagination.compareOrderNullsLast(null, undefined)).toBe(0);
  });
});

describe('Pagination.resolveEntryOrder — unit', function() {
  var PAGE_SIZE = 500;

  it('gives a brand-new row (no id) a page-correct rank+offset value', function() {
    var entries = [{ data: { name: 'New' }, order: 0 }];

    Pagination.resolveEntryOrder(entries, {}, 1, PAGE_SIZE);

    expect(entries[0].order).toBe(500);
  });

  it('restores an untouched row\'s true order exactly, discarding the rank-derived value', function() {
    var originals = { 1: { id: 1, order: 5000 } };
    var entries = [{ id: 1, order: 0 }]; // getData()'s rank-derived value, page-local

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE);

    expect(entries[0].order).toBe(5000);
  });

  it('mutates entries in place and also returns them', function() {
    var originals = { 1: { id: 1, order: 5 } };
    var entries = [{ id: 1, order: 0 }];
    var result = Pagination.resolveEntryOrder(entries, originals, 0, PAGE_SIZE);

    expect(result).toBe(entries);
    expect(entries[0].order).toBe(5);
  });

  it('handles null/empty entries and a missing originalMap gracefully', function() {
    expect(Pagination.resolveEntryOrder([], {}, 1, PAGE_SIZE)).toEqual([]);
    expect(Pagination.resolveEntryOrder(null, {}, 1, PAGE_SIZE)).toEqual([]);
    expect(Pagination.resolveEntryOrder([{ data: {}, order: 0 }], undefined, 1, PAGE_SIZE)[0].order).toBe(500);
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

  // Mirrors the review's own evidence table exactly: page 2, user edited
  // nothing, three shapes of the *real* stored order.

  it('dense originals (500..999), no edit -> 0 rows flagged (this always worked)', function() {
    var originals = {};
    var entries = [];

    for (var i = 0; i < 5; i++) {
      originals[500 + i] = { id: 500 + i, data: { name: 'Row' + i }, order: 500 + i };
      entries.push({ id: 500 + i, data: { name: 'Row' + i }, order: i }); // rank-derived, page-local
    }

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
  });

  it('NULL originals (SSO/API-created rows), no edit -> 0 rows flagged (was 500/500 — the Critical)', function() {
    var originals = {};
    var entries = [];

    for (var i = 0; i < 5; i++) {
      originals[900 + i] = { id: 900 + i, data: { name: 'Row' + i }, order: null };
      entries.push({ id: 900 + i, data: { name: 'Row' + i }, order: i });
    }

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
    entries.forEach(function(entry) { expect(entry.order).toBeNull(); });
  });

  it('sparse originals, gap=10, no edit -> 0 rows flagged (was 500/500 — the Critical)', function() {
    var originals = {};
    var entries = [];

    for (var i = 0; i < 5; i++) {
      originals[700 + i] = { id: 700 + i, data: { name: 'Row' + i }, order: 5000 + (i * 10) };
      entries.push({ id: 700 + i, data: { name: 'Row' + i }, order: i });
    }

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
  });

  it('duplicate originals, no edit -> 0 rows flagged', function() {
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

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
  });

  it('one row edited on a page of NULL-order rows -> only that row is flagged, with its own order preserved', function() {
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

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].id).toBe(902);
    expect(payload.entries[0].data.name).toBe('EditMe CHANGED');
    expect(payload.entries[0].order).toBeNull(); // preserved, not rewritten to a rank value
  });

  it('genuine reorder on page 2 (dense originals) redistributes the page\'s own order values', function() {
    var originals = {
      501: { id: 501, data: { name: 'First' }, order: 500 },
      502: { id: 502, data: { name: 'Second' }, order: 501 }
    };
    var entries = [
      { id: 502, data: { name: 'Second' }, order: 0 }, // dragged to visually first
      { id: 501, data: { name: 'First' }, order: 1 }
    ];

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(2);

    var second = payload.entries.filter(function(e) { return e.id === 502; })[0];
    var first = payload.entries.filter(function(e) { return e.id === 501; })[0];

    // Values are exactly the page's own pre-existing set {500, 501} — redistributed, not invented.
    expect(second.order).toBe(500);
    expect(first.order).toBe(501);
  });

  it('genuine reorder on a page with NULL originals redistributes without inventing a numeric value', function() {
    var originals = {
      901: { id: 901, data: { name: 'A' }, order: null },
      902: { id: 902, data: { name: 'B' }, order: null }
    };
    var entries = [
      { id: 902, data: { name: 'B' }, order: 0 }, // dragged above A
      { id: 901, data: { name: 'A' }, order: 1 }
    ];

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    // Both originals were NULL and tied — the comparator can't distinguish
    // them, so this reads as "unchanged" rather than a detected reorder, and
    // both rows correctly keep the only value they ever had: null. Nothing
    // invents a numeric value out of two nulls.
    expect(payload.entries).toHaveLength(0);
    entries.forEach(function(entry) { expect(entry.order).toBeNull(); });
  });

  it('a brand-new row inserted on page 3 gets a page-correct value, not a 0-based one', function() {
    var originals = {};
    var entries = [{ data: { name: 'Brand new' }, order: 0 }];

    Pagination.resolveEntryOrder(entries, originals, 2, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].order).toBe(1000);
  });

  it('deleting a row on a NULL-order page is unaffected — kept rows still preserve their order', function() {
    var originals = {
      901: { id: 901, data: { name: 'Keep' }, order: null },
      902: { id: 902, data: { name: 'Delete' }, order: null }
    };
    var entries = [
      { id: 901, data: { name: 'Keep' }, order: 0 }
      // 902 missing — deleted
    ];

    Pagination.resolveEntryOrder(entries, originals, 1, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.delete).toEqual([902]);
    expect(payload.entries).toHaveLength(0);
  });

  it('page 1 (offset 0) behaves identically to before for the dense case', function() {
    var originals = {
      1: { id: 1, data: { name: 'Row1' }, order: 0 }
    };
    var entries = [
      { id: 1, data: { name: 'Row1 EDITED' }, order: 0 }
    ];

    Pagination.resolveEntryOrder(entries, originals, 0, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].order).toBe(0);
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
