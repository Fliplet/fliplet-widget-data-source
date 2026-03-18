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
