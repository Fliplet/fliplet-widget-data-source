// "Sign out everywhere": when the toolbar button shows, when it can be
// clicked, the request it sends and what it tells the admin afterwards.
//
// The button ends every session an app user holds in the app, so the rules
// that keep it off a row the admin did not pick - a new row, a selection of
// several rows, a grid with unsaved edits - matter as much as the request.
var test = require('node:test');
var describe = test.describe;
var it = test.it;

var SignOutEverywhere = require('../js/sign-out-everywhere');
var expect = require('./expect');

var emailLogin = { validation: { email: { matchColumn: 'Email' } } };
var columnsLogin = { login: { columns: ['Username', 'Email'] } };

function stubFliplet(options) {
  options = options || {};

  var calls = { confirm: [], request: [], alert: [] };

  return {
    calls: calls,
    Modal: {
      confirm: function(config) {
        calls.confirm.push(config);

        return Promise.resolve(options.confirmed !== false);
      },
      alert: function(config) {
        calls.alert.push(config);

        return Promise.resolve();
      }
    },
    API: {
      request: function(config) {
        calls.request.push(config);

        return options.error
          ? Promise.reject(options.error)
          : Promise.resolve(options.response);
      }
    },
    parseError: function(error) {
      return 'parsed: ' + error.responseJSON.message;
    }
  };
}

describe('SignOutEverywhere.isLoginDataSource', function() {
  it('recognises both kinds of login data source', function() {
    expect(SignOutEverywhere.isLoginDataSource(emailLogin)).toBe(true);
    expect(SignOutEverywhere.isLoginDataSource(columnsLogin)).toBe(true);
  });

  it('does not treat other data sources as login stores', function() {
    expect(SignOutEverywhere.isLoginDataSource()).toBe(false);
    expect(SignOutEverywhere.isLoginDataSource({})).toBe(false);
    expect(SignOutEverywhere.isLoginDataSource({ validation: {} })).toBe(false);
    expect(SignOutEverywhere.isLoginDataSource({ validation: { email: {} } })).toBe(false);
    expect(SignOutEverywhere.isLoginDataSource({ login: { columns: [] } })).toBe(false);
    expect(SignOutEverywhere.isLoginDataSource({ columnsWidths: [50] })).toBe(false);
  });

  it('tells whether the app owns or uses the data source', function() {
    expect(SignOutEverywhere.isUsedByApp({ appId: 12, apps: [] }, 12)).toBe(true);
    expect(SignOutEverywhere.isUsedByApp({ appId: 99, apps: [{ id: 12 }] }, 12)).toBe(true);
    expect(SignOutEverywhere.isUsedByApp({ appId: 99, apps: [{ id: 77 }] }, 12)).toBe(false);
    expect(SignOutEverywhere.isUsedByApp({ appId: 99 }, 12)).toBe(false);
    expect(SignOutEverywhere.isUsedByApp({ appId: 12 }, undefined)).toBe(false);
  });

  it('names the login column', function() {
    expect(SignOutEverywhere.getLoginColumn(emailLogin)).toBe('Email');
    expect(SignOutEverywhere.getLoginColumn(columnsLogin)).toBe('Username');
    expect(SignOutEverywhere.getLoginColumn({})).toBeUndefined();
  });
});

describe('SignOutEverywhere.getState', function() {
  var ready = { appId: 12, definition: emailLogin, entryId: 345, hasChanges: false };

  function withState(changes) {
    return SignOutEverywhere.getState(Object.assign({}, ready, changes));
  }

  it('shows and enables the button for one saved row of an app login data source', function() {
    expect(withState({})).toEqual({ visible: true, enabled: true });
    expect(withState({ definition: columnsLogin })).toEqual({ visible: true, enabled: true });
  });

  it('hides the button when the manager was not opened for an app', function() {
    expect(withState({ appId: undefined })).toEqual({ visible: false, enabled: false });
    expect(withState({ appId: 0 })).toEqual({ visible: false, enabled: false });
  });

  it('hides the button for a data source that is not a login store', function() {
    expect(withState({ definition: {} })).toEqual({ visible: false, enabled: false });
    expect(withState({ definition: undefined })).toEqual({ visible: false, enabled: false });
  });

  it('disables the button without a single saved row selected', function() {
    expect(withState({ entryId: undefined })).toEqual({ visible: true, enabled: false });
  });

  it('disables the button while there are unsaved changes', function() {
    expect(withState({ hasChanges: true })).toEqual({ visible: true, enabled: false });
  });

  it('disables the button while a request is running', function() {
    expect(withState({ busy: true })).toEqual({ visible: true, enabled: false });
  });
});

describe('SignOutEverywhere.getSelectedEntryId', function() {
  var ids = { 1: 101, 2: 102, 3: undefined };

  function getRowId(row) {
    return ids[row];
  }

  function select(selection, rangeCount) {
    return SignOutEverywhere.getSelectedEntryId({
      selection: selection,
      rangeCount: rangeCount === undefined ? 1 : rangeCount,
      getRowId: getRowId
    });
  }

  it('returns the entry of a single selected saved row', function() {
    expect(select([1, 0, 1, 0])).toBe(101);
    // Several cells of the same row are still one row
    expect(select([2, 0, 2, 4])).toBe(102);
  });

  it('returns nothing when several rows are selected', function() {
    expect(select([1, 0, 2, 0])).toBeUndefined();
    expect(select([2, 0, 1, 0])).toBeUndefined();
    expect(select([1, 0, 1, 0], 2)).toBeUndefined();
  });

  it('returns nothing for the column names row', function() {
    expect(select([0, 0, 0, 0])).toBeUndefined();
  });

  it('returns nothing for a row that has not been saved', function() {
    expect(select([3, 0, 3, 0])).toBeUndefined();
    expect(select([40, 0, 40, 0])).toBeUndefined();
  });

  it('returns nothing without a selection', function() {
    expect(SignOutEverywhere.getSelectedEntryId({ rangeCount: 1, getRowId: getRowId })).toBeUndefined();
  });
});

describe('SignOutEverywhere.getMessage', function() {
  it('counts the sessions ended', function() {
    expect(SignOutEverywhere.getMessage({ sessionsEnded: 3, complete: true })).toBe('Signed out of 3 sessions.');
    expect(SignOutEverywhere.getMessage({ sessionsEnded: 1, complete: true })).toBe('Signed out of 1 session.');
    expect(SignOutEverywhere.getMessage({ sessionsEnded: 0, complete: true })).toBe('Signed out of 0 sessions.');
  });

  it('says so when not every session could be checked', function() {
    var message = SignOutEverywhere.getMessage({ sessionsEnded: 2, complete: false });

    expect(message.indexOf('Signed out of 2 sessions.') === 0).toBe(true);
    expect(message.indexOf('Run it again') > -1).toBe(true);
    expect(SignOutEverywhere.getMessage({ sessionsEnded: 2, complete: true }).indexOf('Run it again')).toBe(-1);
  });
});

describe('SignOutEverywhere.run', function() {
  var request = { appId: 12, dataSourceId: 34, entryId: 345 };

  function run(Fliplet, extra) {
    return SignOutEverywhere.run(Object.assign({ Fliplet: Fliplet }, request, extra));
  }

  it('asks first, then ends the sessions of the selected entry in the app', function() {
    var Fliplet = stubFliplet({ response: { sessionsEnded: 2, complete: true } });

    return run(Fliplet, { userLabel: 'jane@example.com' }).then(function(response) {
      expect(Fliplet.calls.confirm).toHaveLength(1);
      expect(Fliplet.calls.confirm[0].message.indexOf('<strong>jane@example.com</strong>') > -1).toBe(true);
      expect(Fliplet.calls.request).toEqual([{
        method: 'POST',
        url: 'v1/apps/12/sessions/revoke',
        data: { dataSourceId: 34, entryId: 345 }
      }]);
      expect(response).toEqual({ sessionsEnded: 2, complete: true });
      expect(Fliplet.calls.alert).toHaveLength(1);
      expect(Fliplet.calls.alert[0].message).toBe('Signed out of 2 sessions.');
    });
  });

  it('escapes the login value it shows in the confirmation', function() {
    var Fliplet = stubFliplet({ response: { sessionsEnded: 0, complete: true } });

    return run(Fliplet, { userLabel: '<img src=x onerror=1>' }).then(function() {
      expect(Fliplet.calls.confirm[0].message.indexOf('<img')).toBe(-1);
      expect(Fliplet.calls.confirm[0].message.indexOf('&lt;img src=x onerror=1&gt;') > -1).toBe(true);
    });
  });

  it('names no one when there is no login value', function() {
    var Fliplet = stubFliplet({ response: { sessionsEnded: 0, complete: true } });

    return run(Fliplet).then(function() {
      expect(Fliplet.calls.confirm[0].message.indexOf('Sign this user out') === 0).toBe(true);
    });
  });

  it('reports a scan that stopped early', function() {
    var Fliplet = stubFliplet({ response: { sessionsEnded: 5, complete: false } });

    return run(Fliplet).then(function() {
      expect(Fliplet.calls.alert[0].message).toBe(SignOutEverywhere.getMessage({ sessionsEnded: 5, complete: false }));
    });
  });

  it('sends nothing when the admin cancels', function() {
    var Fliplet = stubFliplet({ confirmed: false });

    return run(Fliplet).then(function(response) {
      expect(response).toBeUndefined();
      expect(Fliplet.calls.request).toHaveLength(0);
      expect(Fliplet.calls.alert).toHaveLength(0);
    });
  });

  it('shows the parsed error when the request fails', function() {
    var Fliplet = stubFliplet({ error: { responseJSON: { message: 'Not allowed' } } });

    return run(Fliplet).then(function(response) {
      expect(response).toBeUndefined();
      expect(Fliplet.calls.alert).toHaveLength(1);
      expect(Fliplet.calls.alert[0].title).toBe('Could not sign this user out');
      expect(Fliplet.calls.alert[0].message).toBe('parsed: Not allowed');
    });
  });
});
