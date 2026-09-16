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

describe('Pagination.applyPageOrderOffset', function() {
  var PAGE_SIZE = 500;

  it('does not change order values on page 1 (offset is 0)', function() {
    var entries = [{ order: 0 }, { order: 1 }, { order: 2 }];

    Pagination.applyPageOrderOffset(entries, 0, PAGE_SIZE);

    expect(entries.map(function(e) { return e.order; })).toEqual([0, 1, 2]);
  });

  it('offsets page-local order into the correct global range on page 2', function() {
    var entries = [{ order: 0 }, { order: 1 }, { order: 2 }];

    Pagination.applyPageOrderOffset(entries, 1, PAGE_SIZE);

    expect(entries.map(function(e) { return e.order; })).toEqual([500, 501, 502]);
  });

  it('offsets correctly on page 3 (offset = currentPage * pageSize)', function() {
    var entries = [{ order: 0 }, { order: 5 }];

    Pagination.applyPageOrderOffset(entries, 2, PAGE_SIZE);

    expect(entries.map(function(e) { return e.order; })).toEqual([1000, 1005]);
  });

  it('never produces colliding order ranges across consecutive pages', function() {
    var page1 = [{ order: 0 }, { order: 499 }];
    var page2 = [{ order: 0 }, { order: 499 }];
    var page3 = [{ order: 0 }, { order: 499 }];

    Pagination.applyPageOrderOffset(page1, 0, PAGE_SIZE);
    Pagination.applyPageOrderOffset(page2, 1, PAGE_SIZE);
    Pagination.applyPageOrderOffset(page3, 2, PAGE_SIZE);

    var maxOf = function(rows) { return Math.max.apply(null, rows.map(function(e) { return e.order; })); };
    var minOf = function(rows) { return Math.min.apply(null, rows.map(function(e) { return e.order; })); };

    expect(maxOf(page1)).toBeLessThan(minOf(page2));
    expect(maxOf(page2)).toBeLessThan(minOf(page3));
  });

  it('mutates entries in place and also returns them', function() {
    var entries = [{ order: 0 }];
    var result = Pagination.applyPageOrderOffset(entries, 1, PAGE_SIZE);

    expect(result).toBe(entries);
    expect(entries[0].order).toBe(500);
  });

  it('leaves entries without a numeric order field untouched', function() {
    var entries = [{ id: 1 }, { order: null }];

    Pagination.applyPageOrderOffset(entries, 1, PAGE_SIZE);

    expect(entries[0].order).toBeUndefined();
    expect(entries[1].order).toBeNull();
  });

  it('handles null/empty entries gracefully', function() {
    expect(Pagination.applyPageOrderOffset(null, 1, PAGE_SIZE)).toBeNull();
    expect(Pagination.applyPageOrderOffset([], 1, PAGE_SIZE)).toEqual([]);
  });
});

describe('applyPageOrderOffset + computeCommitPayload integration (PS-20272 regression)', function() {
  var guidCounter;
  var mockGuid = function() { return 'guid-' + (++guidCounter); };
  var deepEqual = function(a, b) { return JSON.stringify(a) === JSON.stringify(b); };
  var PAGE_SIZE = 500;

  beforeEach(function() {
    guidCounter = 0;
  });

  it('demonstrates the bug: without the offset, an untouched page-2 row is wrongly flagged as updated', function() {
    // Reproduces exactly what getData() + computeCommitPayload did before the
    // fix: entry.order is page-local (0-based), fed straight in with no offset.
    var originals = {
      501: { id: 501, data: { name: 'Page2Row' }, order: 500 } // true global order, cached from the server
    };
    var entries = [
      { id: 501, data: { name: 'Page2Row' }, order: 0 } // page-local index from getData(), user made no edit
    ];

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    // Bug reproduced: identical data, but order mismatch alone makes it look "updated" —
    // saving it would have overwritten the true order=500 with 0.
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].order).toBe(0);
  });

  it('fix: an untouched page-2 row is left alone once the page offset is applied first', function() {
    var originals = {
      501: { id: 501, data: { name: 'Page2Row' }, order: 500 }
    };
    var entries = [
      { id: 501, data: { name: 'Page2Row' }, order: 0 }
    ];

    Pagination.applyPageOrderOffset(entries, 1, PAGE_SIZE); // page index 1 = second page

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(0);
  });

  it('fix: a real edit on page 2 is still detected and saved with the correct global order', function() {
    var originals = {
      501: { id: 501, data: { name: 'Page2Row' }, order: 500 }
    };
    var entries = [
      { id: 501, data: { name: 'Page2Row EDITED' }, order: 0 }
    ];

    Pagination.applyPageOrderOffset(entries, 1, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].data.name).toBe('Page2Row EDITED');
    expect(payload.entries[0].order).toBe(500);
  });

  it('fix: saving page 1 is unaffected — offset is 0, behavior unchanged', function() {
    var originals = {
      1: { id: 1, data: { name: 'Row1' }, order: 0 }
    };
    var entries = [
      { id: 1, data: { name: 'Row1 EDITED' }, order: 0 }
    ];

    Pagination.applyPageOrderOffset(entries, 0, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].order).toBe(0);
  });

  it('fix: a new row inserted on page 3 gets the correct global order, not a 0-based one', function() {
    var originals = {};
    var entries = [
      { data: { name: 'Brand new row' }, order: 0 } // getData() assigns local index 0
    ];

    Pagination.applyPageOrderOffset(entries, 2, PAGE_SIZE); // page index 2 = third page

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].order).toBe(1000);
  });

  it('fix: deleting a row on page 2 is reported by id — the kept row is unaffected by the offset', function() {
    var originals = {
      501: { id: 501, data: { name: 'KeepMe' }, order: 500 },
      502: { id: 502, data: { name: 'DeleteMe' }, order: 501 }
    };
    var entries = [
      { id: 501, data: { name: 'KeepMe' }, order: 0 }
      // 502 missing from the grid — user deleted it on page 2
    ];

    Pagination.applyPageOrderOffset(entries, 1, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.delete).toEqual([502]);
    expect(payload.entries).toHaveLength(0); // KeepMe's data+order both correctly match the original
  });

  it('fix: dragging to reorder within page 2 produces correct, distinct, in-range global order values', function() {
    // User swaps the visual position of two rows on page 2 — getData()
    // reassigns local indexes 0/1 based on the new visual order.
    var originals = {
      501: { id: 501, data: { name: 'First' }, order: 500 },
      502: { id: 502, data: { name: 'Second' }, order: 501 }
    };
    var entries = [
      { id: 502, data: { name: 'Second' }, order: 0 }, // now visually first
      { id: 501, data: { name: 'First' }, order: 1 } // now visually second
    ];

    Pagination.applyPageOrderOffset(entries, 1, PAGE_SIZE);

    var payload = Pagination.computeCommitPayload(entries, originals, deepEqual, mockGuid);

    expect(payload.entries).toHaveLength(2);

    var second = payload.entries.filter(function(e) { return e.id === 502; })[0];
    var first = payload.entries.filter(function(e) { return e.id === 501; })[0];

    expect(second.order).toBe(500); // now first visually -> lowest order in page 2's range
    expect(first.order).toBe(501); // now second visually
    expect(second.order).toBeLessThan(first.order);
    expect(first.order).toBeLessThan(1000); // stays within page 2's range, doesn't bleed into page 3
  });

  it('fix: page 1 and page 2 order ranges never collide even with simultaneous inserts on both', function() {
    var page1Entries = [{ data: { name: 'New on page 1' }, order: 3 }];
    var page2Entries = [{ data: { name: 'New on page 2' }, order: 2 }];

    Pagination.applyPageOrderOffset(page1Entries, 0, PAGE_SIZE);
    Pagination.applyPageOrderOffset(page2Entries, 1, PAGE_SIZE);

    expect(page1Entries[0].order).toBe(3);
    expect(page2Entries[0].order).toBe(502);
    expect(page1Entries[0].order).toBeLessThan(page2Entries[0].order);
  });
});
