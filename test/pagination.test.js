var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

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

describe('Pagination.resolveFetchErrorRecovery', function() {
  // Stale errors never reach this function: onFetchError returns for them
  // before any recovery, so there is no staleness left for it to decide on.

  it('rolls back to the page actually on screen on a real failure', function() {
    var result = Pagination.resolveFetchErrorRecovery(2);

    expect(result.currentPage).toBe(2);
    expect(result.lastRenderedPage).toBe(2);
  });

  it('is a no-op rollback when the page that failed is the page already on screen', function() {
    // e.g. a save-triggered refetch of the current page that fails
    var result = Pagination.resolveFetchErrorRecovery(0);

    expect(result.currentPage).toBe(0);
  });
});
