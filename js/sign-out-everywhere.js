/**
 * "Sign out everywhere": an app editor ends every session one app user holds
 * in the app the manager was opened for.
 *
 * The user is a row of the app's login data source. The API removes that
 * user's login from each of their sessions and gives those sessions a new
 * token, so every device holding one is signed out on its next request. The
 * row itself is not touched, and the user can still log in again.
 *
 * In its own module so the rules for showing and enabling the button, the
 * request and the wording are executed by the specs. spreadsheet.js only wires
 * it to the toolbar.
 */

// eslint-disable-next-line no-unused-vars
var SignOutEverywhere = (function() {
  'use strict';

  /**
   * Whether a data source is used to log app users in.
   * @param {Object} definition - Data source definition
   * @returns {Boolean} True when the definition has login settings
   */
  function isLoginDataSource(definition) {
    if (!definition || typeof definition !== 'object') {
      return false;
    }

    var validation = definition.validation;
    var login = definition.login;

    if (validation && validation.email && validation.email.matchColumn) {
      return true;
    }

    return !!(login && Array.isArray(login.columns) && login.columns.length);
  }

  /**
   * Whether a data source is used by an app, by the same rule the manager uses
   * to list an app's data sources.
   * @param {Object} dataSource - Data source with appId and apps
   * @param {Number} appId - App ID
   * @returns {Boolean} True when the data source belongs to or is used by the app
   */
  function isUsedByApp(dataSource, appId) {
    if (!dataSource || !appId) {
      return false;
    }

    if (dataSource.appId === appId) {
      return true;
    }

    return Array.isArray(dataSource.apps) && dataSource.apps.some(function(app) {
      return !!app && app.id === appId;
    });
  }

  /**
   * Find the apps that use a data source the app does not own.
   *
   * DEV-2625 FUNC-007: the manager's details come from getById, whose answer
   * leaves out `apps` once the API has cached the user's access to the data
   * source. A source owned by another app then looked unused, and the button
   * was missing. The data source list is built with the apps that use each
   * source every time, so its entry is read instead, or the list for the app
   * is fetched when the manager opened straight on the data source.
   * @param {Object} options - Lookup details
   * @param {Object} options.Fliplet - Fliplet SDK
   * @param {Number} [options.appId] - App the manager was opened for
   * @param {Object} options.dataSource - Data source as getById returned it
   * @param {Array} [options.listed] - Data sources the manager has listed, if it has
   * @returns {Promise} Resolves with the data source's apps when the list adds
   *   to what getById said, otherwise undefined. Never rejects.
   */
  function findAppsUsing(options) {
    var dataSource = options.dataSource;
    var appId = options.appId;

    if (!dataSource || !appId || isUsedByApp(dataSource, appId)) {
      return Promise.resolve();
    }

    function findIn(list) {
      return (Array.isArray(list) ? list : []).filter(function(item) {
        return !!item && item.id === dataSource.id;
      })[0];
    }

    var listed = findIn(options.listed);

    return Promise.resolve().then(function() {
      if (listed) {
        return listed;
      }

      return options.Fliplet.DataSources.get({
        roles: 'publisher,editor',
        appId: appId,
        includeInUse: true,
        attributes: 'id,appId,apps',
        type: null
      }, {
        cache: false
      }).then(findIn);
    }).then(function(entry) {
      var apps = (Array.isArray(dataSource.apps) ? dataSource.apps : []).concat(entry && Array.isArray(entry.apps) ? entry.apps : []);

      if (!isUsedByApp({ apps: apps }, appId)) {
        return;
      }

      var seen = {};

      return apps.filter(function(app) {
        if (!app || seen[app.id]) {
          return false;
        }

        seen[app.id] = true;

        return true;
      });
    }).catch(function() {
      // The button stays hidden, as it was before the lookup
    });
  }

  /**
   * Columns a hook hashes, which hold a secret rather than who the user is.
   * The same rule as the API's DataSource#getHashedFields.
   * @param {Array} [hooks] - Data source hooks
   * @returns {Array} Column names
   */
  function getHashedColumns(hooks) {
    var columns = [];

    (Array.isArray(hooks) ? hooks : []).forEach(function(hook) {
      if (!hook || hook.type !== 'operations' || !hook.payload || typeof hook.payload !== 'object') {
        return;
      }

      Object.keys(hook.payload).forEach(function(column) {
        var operations = hook.payload[column];

        if (Array.isArray(operations) && operations.indexOf('hash') !== -1 && columns.indexOf(column) === -1) {
          columns.push(column);
        }
      });
    });

    return columns;
  }

  /**
   * The columns that name the user in the confirmation.
   *
   * DEV-2625 FUNC-006: this used to be the first of `definition.login.columns`.
   * That order is a convention only - sign-in sorts the columns - so a source
   * listed as ['PIN', 'Username'] named every user by their PIN, and two users
   * who share it looked the same. The API matches a session on every login
   * column that is not a secret (routes/v1/apps-sessions.js
   * getIdentityColumns), so the confirmation shows those same columns.
   * @param {Object} definition - Data source definition
   * @param {Array} [hooks] - Data source hooks
   * @returns {Array} Column names, empty when there are none to show
   */
  function getLabelColumns(definition, hooks) {
    if (!isLoginDataSource(definition)) {
      return [];
    }

    var emailValidation = definition.validation && definition.validation.email;
    var matchColumn = emailValidation && emailValidation.matchColumn;

    if (typeof matchColumn === 'string' && matchColumn) {
      return [matchColumn];
    }

    var secrets = getHashedColumns(hooks);
    var passwordColumn = emailValidation && emailValidation.passwordColumn;

    if (passwordColumn) {
      secrets.push(passwordColumn);
    }

    var columns = definition.login && definition.login.columns;

    return (Array.isArray(columns) ? columns : []).filter(function(column, index, list) {
      return typeof column === 'string' && column
        && secrets.indexOf(column) === -1
        && list.indexOf(column) === index;
    });
  }

  /**
   * Name the user from the values of their row in the label columns.
   * @param {Array} columns - Label columns, from getLabelColumns()
   * @param {Function} getValue - Returns the row's value of a column
   * @returns {String} Non-empty values joined, or an empty string
   */
  function getUserLabel(columns, getValue) {
    return (columns || []).map(function(column) {
      var value = getValue(column);

      return value === undefined || value === null ? '' : String(value).trim();
    }).filter(Boolean).join(' · ');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Work out whether the button shows and whether it can be clicked.
   * @param {Object} options - Current state
   * @param {Number} [options.appId] - App the manager was opened for
   * @param {Object} [options.definition] - Definition of the data source on screen
   * @param {Number} [options.entryId] - ID of the selected row, when exactly one saved row is selected
   * @param {Boolean} [options.hasChanges] - Whether the grid has unsaved changes
   * @param {Boolean} [options.busy] - Whether a request is already running
   * @returns {Object} { visible: Boolean, enabled: Boolean }
   */
  function getState(options) {
    options = options || {};

    var visible = !!options.appId && isLoginDataSource(options.definition);
    var enabled = visible
      && !!options.entryId
      && !options.hasChanges
      && !options.busy;

    return {
      visible: visible,
      enabled: enabled
    };
  }

  /**
   * Read the grid's current selection, whatever shape its version returns:
   * one range as [row, col, row2, col2], or a list of such ranges.
   *
   * DEV-2625 FUNC-002: the button used to act on the range a selection hook
   * had reported earlier. Extending the selection with Shift and an arrow key
   * left that copy behind, so the button stayed enabled for a selection that
   * had grown past one row and signed out the row it had been on. The grid is
   * the only thing that knows what is selected now, so it is asked each time.
   * @param {Array} [selected] - What the grid's getSelected() returned
   * @returns {Object} { selection: Array|undefined, rangeCount: Number }
   */
  function readSelection(selected) {
    if (!Array.isArray(selected) || !selected.length) {
      return { selection: undefined, rangeCount: 0 };
    }

    if (Array.isArray(selected[0])) {
      return { selection: selected[selected.length - 1], rangeCount: selected.length };
    }

    return { selection: selected, rangeCount: 1 };
  }

  /**
   * Find the selected entry, if the selection is exactly one saved row.
   * @param {Object} options - Selection details
   * @param {Array} options.selection - Last selected range as [row, col, row2, col2], visual indexes
   * @param {Number} options.rangeCount - Number of ranges selected
   * @param {Function} options.getRowId - Returns the entry ID of a visual row, if it has been saved
   * @returns {Number|undefined} Entry ID
   */
  function getSelectedEntryId(options) {
    options = options || {};

    var selection = options.selection;

    if (!Array.isArray(selection) || options.rangeCount !== 1) {
      return;
    }

    var row = selection[0];

    // Row 0 holds the column names, not an entry
    if (row !== selection[2] || typeof row !== 'number' || row < 1) {
      return;
    }

    var id = options.getRowId(row);

    return typeof id === 'number' && id > 0 ? id : undefined;
  }

  /**
   * Describe the outcome of a request.
   * @param {Object} response - { sessionsEnded: Number, complete: Boolean }
   * @returns {String} Message for the user
   */
  function getMessage(response) {
    response = response || {};

    var count = response.sessionsEnded || 0;
    var message = 'Signed out of ' + count + ' ' + (count === 1 ? 'session' : 'sessions') + '.';

    if (response.complete === false) {
      message += ' Not every session could be checked this time. Run it again to sign the user out of the rest.';
    }

    return message;
  }

  /**
   * Ask for confirmation, then end the user's sessions.
   * @param {Object} options - Request details
   * @param {Object} options.Fliplet - Fliplet SDK
   * @param {Number} options.appId - App to end the sessions in
   * @param {Number} options.dataSourceId - Login data source
   * @param {Number} options.entryId - Row of the user to sign out
   * @param {String} [options.userLabel] - Login values of the row, to name the user in the confirmation
   * @returns {Promise} Resolves with the API response, or undefined when cancelled or failed. Never rejects.
   */
  function run(options) {
    var Fliplet = options.Fliplet;

    // Started inside a promise so that anything that throws, even before the
    // confirmation opens, ends up in the one error alert below
    return Promise.resolve().then(function() {
      return confirmAndRequest(Fliplet, options);
    }).catch(function(error) {
      try {
        Fliplet.Modal.alert({
          title: 'Could not sign this user out',
          message: Fliplet.parseError(error)
        });
      } catch (e) {
        // Nothing more can be shown
      }
    }).then(function(response) {
      // Past the error alert on purpose: once the request has succeeded the
      // sessions are ended, and nothing here may claim otherwise
      if (response) {
        try {
          Fliplet.Modal.alert({
            title: 'Sign out everywhere',
            message: getMessage(response)
          });
        } catch (e) {
          // The sessions are ended either way
        }
      }

      return response;
    });
  }

  // The API scans a bounded number of sessions per request and returns
  // `after` when it stops early. Keep calling from that position so a large
  // app's older sessions are reached. Cap the loop so a broken cursor cannot
  // retry forever; the per-user rate limit is 10 requests a minute.
  var MAX_REVOKE_REQUESTS = 8;

  function requestUntilComplete(Fliplet, options) {
    var total = 0;
    var after;

    function once(attempt) {
      var data = {
        dataSourceId: options.dataSourceId,
        entryId: options.entryId
      };

      if (after) {
        data.after = after;
      }

      return Fliplet.API.request({
        method: 'POST',
        url: 'v1/apps/' + options.appId + '/sessions/revoke',
        data: data
      }).then(function(response) {
        response = response || {};
        total += response.sessionsEnded || 0;

        if (response.complete !== false) {
          return { sessionsEnded: total, complete: true };
        }

        if (response.after && attempt < MAX_REVOKE_REQUESTS) {
          after = response.after;

          return once(attempt + 1);
        }

        return { sessionsEnded: total, complete: false };
      });
    }

    return once(1);
  }

  function confirmAndRequest(Fliplet, options) {
    var label = options.userLabel === undefined || options.userLabel === null ? '' : String(options.userLabel).trim();
    // The entry ID tells apart two users whose shown values are the same
    var entry = 'entry ID <strong>' + escapeHtml(options.entryId) + '</strong>';
    var who = label ? '<strong>' + escapeHtml(label) + '</strong> (' + entry + ')' : 'the user in ' + entry;

    return Fliplet.Modal.confirm({
      title: 'Sign out everywhere',
      message: 'Sign ' + who + ' out of all their sessions in this app? They will be signed out on every device and need to log in again. This does not stop them from logging in.',
      buttons: {
        confirm: {
          label: 'Sign out everywhere'
        }
      }
    }).then(function(confirmed) {
      if (!confirmed) {
        return;
      }

      return requestUntilComplete(Fliplet, options);
    });
  }

  return {
    isLoginDataSource: isLoginDataSource,
    isUsedByApp: isUsedByApp,
    findAppsUsing: findAppsUsing,
    getLabelColumns: getLabelColumns,
    getUserLabel: getUserLabel,
    getState: getState,
    readSelection: readSelection,
    getSelectedEntryId: getSelectedEntryId,
    getMessage: getMessage,
    run: run
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SignOutEverywhere;
}
