// The wording a save uses to report what it declined.
//
// It exists because every bounded path here fails quietly by design - the row
// saves, it just reloads somewhere else - so the message is the only thing
// standing between that and a user who thinks the save worked. While it lived
// in interface.js nothing executed it, and the case it got wrong was the one
// path that skipped placement without a drag: a sorted grid.
var test = require('node:test');
var describe = test.describe;
var it = test.it;

var CommitNotice = require('../js/commit-notice');
var expect = require('./expect');

describe('CommitNotice.forDeclined', function() {
  it('says nothing when the save persisted everything', function() {
    expect(CommitNotice.forDeclined({ sorted: false, rows: 0 })).toBe('');
    expect(CommitNotice.forDeclined({ sorted: true, rows: 0 })).toBe('');
  });

  it('survives a payload with no declined block', function() {
    expect(CommitNotice.forDeclined()).toBe('');
    expect(CommitNotice.forDeclined(null)).toBe('');
  });

  it('speaks for a row added while a column is sorted', function() {
    var message = CommitNotice.forDeclined({ sorted: true, rows: 1 });

    expect(message.indexOf('while a column is sorted') > -1).toBe(true);
    expect(message.indexOf('Clear the sort') > -1).toBe(true);
  });

  it('counts them when several rows were added under a sort', function() {
    expect(CommitNotice.forDeclined({ sorted: true, rows: 3 }).indexOf('3 new rows') === 0).toBe(true);
  });

  it('speaks for a row the order column had no value left for', function() {
    // The only decline left that is not a sort: `order` is a 32-bit integer, so
    // a data source parked against the end of the column has no number left to
    // give a new row. Writing one anyway would fail the save outright, and a
    // decline nobody is told about is how a user thinks the save worked.
    var message = CommitNotice.forDeclined({ sorted: false, rows: 1 });

    expect(message.indexOf('A new row') === 0).toBe(true);
    expect(message.indexOf('run out of row order values') > -1).toBe(true);
    expect(CommitNotice.forDeclined({ sorted: false, rows: 4 }).indexOf('4 new rows') === 0).toBe(true);
  });

  it('prefers the sort, which is the one the user can undo', function() {
    var message = CommitNotice.forDeclined({ sorted: true, rows: 1 });

    expect(message.indexOf('Clear the sort') > -1).toBe(true);
  });
});
