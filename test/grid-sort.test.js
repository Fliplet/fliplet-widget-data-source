// The predicate behind the sort guard.
//
// It gates two working features - drag-to-reorder and insert placement - so
// getting it wrong fails closed and silently. The specs drive it with a fake
// Handsontable instance rather than a literal, because the defect it exists to
// prevent was invisible to a test that passed the answer in.
var test = require('node:test');
var describe = test.describe;
var it = test.it;

var GridSort = require('../js/grid-sort');
var expect = require('./expect');

describe('GridSort.isSortApplied', function() {
  it('reads no sort on a freshly loaded grid', function() {
    expect(GridSort.isSortApplied({ sortOrder: undefined, sortColumn: undefined })).toBe(false);
  });

  it('reads a sort while one is applied, ascending or descending', function() {
    expect(GridSort.isSortApplied({ sortOrder: true, sortColumn: 2 })).toBe(true);

    // sortOrder is false for descending - a truthiness test would report no
    // sort here and let the sorted sequence be persisted
    expect(GridSort.isSortApplied({ sortOrder: false, sortColumn: 2 })).toBe(true);
  });

  it('reads no sort again once the header cycle has cleared it', function() {
    // The three clicks Handsontable walks through. sortColumn is deliberately
    // left set on the last one: that is what the plugin's own isSorted() reads,
    // and why it goes on reporting a sort over an unsorted grid.
    var hot = { sortOrder: undefined, sortColumn: undefined };
    var applied = [];

    [true, false, undefined].forEach(function(order) {
      hot.sortOrder = order;
      hot.sortColumn = 2;
      applied.push(GridSort.isSortApplied(hot));
    });

    expect(applied).toEqual([true, true, false]);
  });

  it('survives a grid that is not there', function() {
    expect(GridSort.isSortApplied(null)).toBe(false);
    expect(GridSort.isSortApplied(undefined)).toBe(false);
  });
});
