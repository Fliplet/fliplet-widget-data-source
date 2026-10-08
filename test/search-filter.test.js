// PS-2313: the Find box on a paginated data source searches server-side
var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var SearchFilter = require('../js/search-filter');

describe('SearchFilter.buildWhere', function() {
  it('matches the bare term in every column with $iLike', function() {
    expect(SearchFilter.buildWhere(['Email', 'Name'], 'smith')).toEqual({
      $or: [
        { Email: { $iLike: 'smith' } },
        { Name: { $iLike: 'smith' } }
      ]
    });
  });

  it('skips columns that would read as operators', function() {
    expect(SearchFilter.buildWhere(['Email', '$meta'], 'x')).toEqual({
      $or: [{ Email: { $iLike: 'x' } }]
    });
  });

  it('is null when there is nothing to match', function() {
    expect(SearchFilter.buildWhere(['Email'], '  ')).toBe(null);
    expect(SearchFilter.buildWhere([], 'x')).toBe(null);
    expect(SearchFilter.buildWhere(['$a'], 'x')).toBe(null);
  });
});

describe('SearchFilter.isActive', function() {
  it('is on with a term and more rows than a page', function() {
    expect(SearchFilter.isActive('x', 501, 500)).toBe(true);
  });

  it('is off when the rows fit in a page or there is no term', function() {
    expect(SearchFilter.isActive('x', 500, 500)).toBe(false);
    expect(SearchFilter.isActive('', 900, 500)).toBe(false);
    expect(SearchFilter.isActive('  ', 900, 500)).toBe(false);
  });
});

describe('SearchFilter.rangeText', function() {
  it('names the match count and the term', function() {
    var text = SearchFilter.rangeText({ startEntry: 1, endEntry: 37, totalEntries: 37 }, 'smith');

    expect(text.indexOf('37') > -1).toBe(true);
    expect(text.indexOf('smith') > -1).toBe(true);
    expect(text).toBe('1–37 of 37 entries matching "smith"');
  });

  it('says so when nothing matched', function() {
    expect(SearchFilter.rangeText({ startEntry: 0, endEntry: 0, totalEntries: 0 }, 'x')).toBe('No entries matching "x"');
  });
});
