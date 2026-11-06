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
   * The column that holds the login value, used to name the user in the confirmation.
   * @param {Object} definition - Data source definition
   * @returns {String|undefined} Column name
   */
  function getLoginColumn(definition) {
    if (!isLoginDataSource(definition)) {
      return;
    }

    var validation = definition.validation;
    var matchColumn = validation && validation.email && validation.email.matchColumn;

    if (typeof matchColumn === 'string' && matchColumn) {
      return matchColumn;
    }

    var columns = definition.login && definition.login.columns;
    var first = Array.isArray(columns) ? columns[0] : undefined;

    return typeof first === 'string' && first ? first : undefined;
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
   * @param {String} [options.userLabel] - Login value of the row, to name the user in the confirmation
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

  function confirmAndRequest(Fliplet, options) {
    var label = options.userLabel === undefined || options.userLabel === null ? '' : String(options.userLabel).trim();
    var who = label ? '<strong>' + escapeHtml(label) + '</strong>' : 'this user';

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

      return Fliplet.API.request({
        method: 'POST',
        url: 'v1/apps/' + options.appId + '/sessions/revoke',
        data: {
          dataSourceId: options.dataSourceId,
          entryId: options.entryId
        }
      }).then(function(response) {
        // Always something to report, even if the reply carried no body
        return response || {};
      });
    });
  }

  return {
    isLoginDataSource: isLoginDataSource,
    isUsedByApp: isUsedByApp,
    getLoginColumn: getLoginColumn,
    getState: getState,
    getSelectedEntryId: getSelectedEntryId,
    getMessage: getMessage,
    run: run
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SignOutEverywhere;
}
