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
    expect(CommitNotice.forDeclined({ reorder: false, sorted: false, rows: 0 })).toBe('');
  });

  it('survives a payload with no declined block', function() {
    expect(CommitNotice.forDeclined()).toBe('');
    expect(CommitNotice.forDeclined(null)).toBe('');
  });

  it('speaks for a row added while a column is sorted', function() {
    var message = CommitNotice.forDeclined({ reorder: false, sorted: true, rows: 1 });

    expect(message.indexOf('while a column is sorted') > -1).toBe(true);
    expect(message.indexOf('Clear the sort') > -1).toBe(true);
  });

  it('counts them when several rows were added under a sort', function() {
    expect(CommitNotice.forDeclined({ reorder: false, sorted: true, rows: 3 }).indexOf('3 new rows') === 0).toBe(true);
  });

  it('says a refused drag took the new rows with it', function() {
    // The message used to talk only about row order while the row the user had
    // just added moved as well - on an unordered data source, to the very top.
    var message = CommitNotice.forDeclined({ reorder: true, sorted: false, rows: 1 });

    expect(message.indexOf('previous order') > -1).toBe(true);
    expect(message.indexOf('the row you added') > -1).toBe(true);
  });

  it('says only what happened when a refused drag added nothing', function() {
    var message = CommitNotice.forDeclined({ reorder: true, sorted: false, rows: 0 });

    expect(message.indexOf('previous order') > -1).toBe(true);
    expect(message.indexOf('you added') > -1).toBe(false);
  });

  it('speaks for a row the placement pass could not afford', function() {
    expect(CommitNotice.forDeclined({ reorder: false, sorted: false, rows: 1 }).indexOf('A new row') === 0).toBe(true);
    expect(CommitNotice.forDeclined({ reorder: false, sorted: false, rows: 4 }).indexOf('4 new rows') === 0).toBe(true);
  });

  it('prefers the sort, which is the one the user can undo', function() {
    var message = CommitNotice.forDeclined({ reorder: true, sorted: true, rows: 1 });

    expect(message.indexOf('Clear the sort') > -1).toBe(true);
  });
});
