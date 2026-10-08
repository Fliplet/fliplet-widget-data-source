/* global Pagination, WaitUntilSized, EntryDiff, CommitNotice, DuplicateRows, SaveState */
var $initialSpinnerLoading = $('.spinner-holder');
var $contents = $('#contents');
var $sourceContents = $('#source-contents');
var $dataSources = $('#data-sources > tbody');
var $helpIcon = $('.help-icon');
var $trashedDataSources = $('#trash-sources > tbody');
var $usersContents = $('#users');
var $versionsContents = $('#versions-list');
var $versionContents = $('#version-preview');
var $accessRulesList = $('#access-rules-list');
var $settings = $('form[data-settings]');
var $noDataSources = $('.no-data-sources-found');
var $noResults = $('.no-results-found');
var $appsBtnFilter = $('button[data-apps]');
var $allowBtnFilter = $('button[data-allow]');
var $typeCheckbox = $('input[name="type"]');
var $activeDataSourceTable = $('#data-sources');
var $btnShowAllSource = $('[data-show-all-source]');
var $activeSortedColumn;
var preconfiguredRules = Fliplet.Registry.get('preconfigured-rules');
var currentDataSource;
var currentDataSourceId;
var currentDataSourceType;
// eslint-disable-next-line no-unused-vars
var currentDataSourceDefinition;

var currentDataSourceUpdatedAt;
var currentDataSourceRowsCount;
var currentDataSourceColumnsCount;
// Value of every cell in the two placeholder rows an empty data source opens with
var DEMO_ROW_VALUE = 'demo data';
var DEMO_ROW_DATA = {
  'Column 1': DEMO_ROW_VALUE,
  'Column 2': DEMO_ROW_VALUE
};
// How many demo rows the grid opens with. Any more are copies of them.
var DEMO_ROW_COUNT = 2;
// Whether the grid was loaded with the demo rows, which the duplicate check
// must not report as copies (PS-2251)
var showingDemoData = false;
var currentDataSourceVersions;
var currentDataSourceRules;
var currentDataSourceRuleIndex;
var filteredDataSources;
var dataSources;
var trashedDataSources;
var allDataSources;
var table;
var isShowingAll = false;
var columns;
var dataSourcesToSearch = [];
var initialLoad = true;
var columnsListMode = 'include';
var entryMap = {
  original: {},
  entries: {}
};
var currentFinalRules;
var integrationTokenList = [];
var selectedTokenId;
var selectedTokenName;
var globalTimer;
var dataSourceIsLive = false;
var locale = navigator.language.indexOf('en') === 0 ? navigator.language : 'en';

// Pagination state
var PAGE_SIZE = 500;
var currentPage = 0;
var totalEntries = 0;
var totalPages = 0;
var fetchGeneration = 0;
// The page whose entries are actually rendered in the grid right now. Distinct
// from currentPage, which is updated optimistically before a page fetch even
// starts — on a failed fetch we roll currentPage back to this so pagination
// controls (and the next navigation request) stay aligned with what's on screen.
var lastRenderedPage = 0;
// Where the cached page sits in the data source (PS-2204), cached with its rows:
// { offset, before, after }, where before/after are the { id, order } of the
// rows just above and below the page - the neighbours a row added at the top or
// bottom of it is placed between (null at either end of the data source). Null
// when no page is cached, and EntryDiff then treats the grid as the whole thing.
var pageEdges = null;
// The save that is running, until it settles (PS-2204). A Save & close
// meanwhile waits for it, so the two never overlap.
var saveInProgress = null;
// The grid shows the demo columns of an empty data source, which it does not have
var demoColumns = false;

var DESCRIPTION_APP_UNKNOWN = 'Other...';

var defaultAccessRules = [
  { type: ['select', 'insert', 'update', 'delete'], allow: 'all' }
];

var getApps = Fliplet.Apps.get().then(function(apps) {
  return _.sortBy(apps, function(app) {
    return app.name.toLowerCase();
  });
});

var widgetId = parseInt(Fliplet.Widget.getDefaultId(), 10);
var widgetData = Fliplet.Widget.getData(widgetId) || {};

var hooksEditor = CodeMirror.fromTextArea($('#hooks')[0], {
  lineNumbers: true,
  mode: 'javascript'
});

var definitionEditor = CodeMirror.fromTextArea($('#definition')[0], {
  lineNumbers: true,
  mode: 'javascript'
});

var customRuleEditor = CodeMirror.fromTextArea($('#custom-rule')[0], {
  lineNumbers: true,
  mode: 'javascript'
});
var accessRulesEditor = CodeMirror.fromTextArea($('#access-rules-json')[0], {
  lineNumbers: true,
  mode: 'javascript'
});


var emptyColumnNameRegex = /^Column\s\([0-9]+\)$/;

Fliplet.API.request({
  url: 'v1/apps/tokens'
}).then(function(response) {
  integrationTokenList = response.appTokens;
});

// Fetch all data sources
function getDataSources() {
  $initialSpinnerLoading.addClass('animated');
  $contents.addClass('hidden');
  $noResults.removeClass('show');
  $noDataSources.removeClass('show');
  $sourceContents.addClass('hidden');
  $('.search').val(''); // Reset search
  $('#search-field').val(''); // Reset filter
  $('#data-sources').show();
  $('#trash-sources').hide();

  return Fliplet.DataSources.get({
    roles: 'publisher,editor',
    appId: isShowingAll ? undefined : widgetData.appId,
    includeInUse: !isShowingAll && !!widgetData.appId,
    attributes: 'id,name,bundle,createdAt,updatedAt,appId,apps',
    type: null,
    excludeTypes: 'bookmarks,likes,comments,menu,conversation'
  }, {
    cache: false
  })
    .then(function(userDataSources) {
      allDataSources = userDataSources;

      if ((widgetData.context === 'app-overlay' || widgetData.appId) && !isShowingAll) {
        // Changes UI text
        isShowingAll = false;

        $btnShowAllSource.removeClass('hidden');
        $('[data-app-source]').addClass('hidden');
        $('[data-back]').text('See all my project\'s data sources');
        $helpIcon.addClass('hidden');

        // Filters data sources
        var filteredDataSources = [];

        userDataSources.forEach(function(dataSource, index) {
          var matchedApp = _.find(dataSource.apps, function(app) {
            return dataSource.appId === widgetData.appId || app.id === widgetData.appId;
          });

          if (dataSource.appId === widgetData.appId && !dataSource.apps.length) {
            matchedApp = true;
          }

          if (matchedApp) {
            filteredDataSources.push(userDataSources[index]);
          }
        });
        dataSourcesToSearch = filteredDataSources;
        dataSources = filteredDataSources;
      } else {
        dataSourcesToSearch = userDataSources;
        dataSources = userDataSources;
      }

      if (!dataSources.length) {
        $noResults.addClass('show');
      }

      // Order data sources by updatedAt
      var orderedDataSources = sortDataSources('updatedAt', 'desc', dataSources);

      // Start rendering process
      renderDataSources(orderedDataSources);
      toggleSortedIcon($activeDataSourceTable.children('thead').find('.sorted'));
    })
    .catch(function(error) {
      renderError({
        message: 'Error loading data sources',
        error: error
      });

      if (typeof Raven === 'undefined') {
        return;
      }

      if (!(error instanceof Error)) {
        Raven.captureMessage('Error loading data sources', { extra: { error: error } });

        return;
      }

      Raven.captureException(error);
    });
}

function renderDataSources(dataSources) {
  var html = [];

  dataSources.forEach(function(dataSource) {
    html.push(getDataSourceRender(dataSource));
  });

  $dataSources.html(html.join(''));
  $initialSpinnerLoading.removeClass('animated');
  $contents.removeClass('hidden');
  $('#trash-sources').hide();
}

function sortColumn($element, column, data, defaultOrder) {
  var isOrderedByAsc = $element.hasClass('asc');
  var newOrder;

  if ($element.hasClass('sorted')) {
    newOrder = isOrderedByAsc ? 'desc' : 'asc';

    $element.toggleClass('desc', isOrderedByAsc);
    $element.toggleClass('asc', !isOrderedByAsc);
  } else {
    newOrder = defaultOrder;

    $element.removeClass('asc desc');
    $element.toggleClass(defaultOrder, true);
  }

  return sortDataSources(column, newOrder, data);
}

function renderTrashedDataSources(trashedDataSources) {
  var html = trashedDataSources.map(function(trashSource) {
    return getTrashSourceRender(trashSource);
  });

  $trashedDataSources.html(html.join(''));
  $initialSpinnerLoading.removeClass('animated');
  $contents.removeClass('hidden');
}

function renderError(options) {
  if (options === 'string') {
    options = {
      message: options
    };
  }

  options = options || {};
  options.message = options.message || 'Unexpected error';

  var parsedError = Fliplet.parseError(options.error);

  if (!parsedError) {
    Fliplet.Modal.alert({
      message: options.message
    });

    return;
  }

  Fliplet.Modal.confirm({
    message: options.message,
    buttons: {
      cancel: {
        label: 'Details'
      },
      confirm: {
        label: 'OK'
      }
    }
  }).then(function(dismiss) {
    if (dismiss) {
      return;
    }

    Fliplet.Modal.alert({
      message: parsedError
    });
  });
}

/**
 * Covers the grid until the rows it shows are the ones saved (PS-2204)
 * @param {String} message - Text shown on the loader
 * @returns {void}
 */
function showGridLoader(message) {
  $('.page-loading-overlay').text(message).removeClass('hidden');
}

/**
 * Removes the loader
 * @returns {void}
 */
function hideGridLoader() {
  $('.page-loading-overlay').addClass('hidden');
}

function renderSpreadsheet(rowsData, fetchId, reloadToken) {
  WaitUntilSized.waitUntilSized('.table-entries', function() {
    // Discard a stale render: a newer fetch (fetchGeneration) started
    // while this one was waiting for the container to be sized.
    if (typeof fetchId === 'number' && fetchId !== fetchGeneration) {
      return;
    }

    // Reached only once this render has actually survived the sizing wait and
    // the generation check — this is genuinely what's about to be painted, so
    // it's the correct page to roll back to if a later navigation fails.
    lastRenderedPage = currentPage;

    table = spreadsheet({ columns: columns, rows: rowsData, demoColumns: demoColumns, isLocked: isSaveLocked });
    $('.table-entries').css('visibility', 'visible').removeAttr('aria-busy');
    hideGridLoader();
    $('#versions').removeClass('hidden');
    updatePaginationControls();
    onGridReloaded(reloadToken);
  });
}

function fetchCurrentDataSourceDetails() {
  definitionEditor.setValue('');
  hooksEditor.setValue('');
  accessRulesEditor.setValue('[]');

  return Fliplet.DataSources.getById(currentDataSourceId, { cache: false }).then(function(dataSource) {
    $settings.find('#id').html(dataSource.id);
    $settings.find('[name="name"]').val(dataSource.name);

    $('#bundle-online').prop('checked', dataSource.bundle === false);

    currentDataSourceType = dataSource.type;

    let accessRules = Array.isArray(dataSource.accessRules) ? dataSource.accessRules : [];

    currentDataSourceRules = Array.isArray(dataSource.accessRules) ? JSON.parse(JSON.stringify(dataSource.accessRules)) : dataSource.accessRules;
    currentFinalRules = Array.isArray(dataSource.accessRules) ? JSON.parse(JSON.stringify(dataSource.accessRules)) : dataSource.accessRules;
    currentDataSourceDefinition = dataSource.definition || {};

    accessRulesEditor.setValue(JSON.stringify(accessRules, null, 2));

    if (dataSource.apps && dataSource.apps.length > 0) {
      dataSourceIsLive = _.some(dataSource.apps, function(app) {
        return app.productionAppId;
      });
    }

    if (dataSource.definition) {
      definitionEditor.setValue(JSON.stringify(dataSource.definition, null, 2));
    }

    if (dataSource.hooks) {
      hooksEditor.setValue(JSON.stringify(dataSource.hooks, null, 2));
    }
  });
}

function fetchCurrentDataSourceUsers() {
  return Fliplet.DataSources.connect(currentDataSourceId).then(function(source) {
    source.getUsers().then(function(users) {
      var tpl = Fliplet.Widget.Templates['templates.users'];
      var html = tpl({
        users: users
      });

      $usersContents.html(html);
    });
  });
}

/**
 * Cache a list of entries as original entries for comparison when committing changes
 * @param {Array} entries - Entries to be cached as original entries
 * @param {Object} [clientIdMap] - Optional map of client IDs to new entry IDs to map add the missing entry IDs. This mutates the entries provided.
 * @param {Object} [orders] - Optional orders the data source settled on, keyed by entry id and by clientId for rows that did not have one. Pass it after a commit: the entries come from getData(), which carries no order.
 * @returns {undefined}
 */
function cacheOriginalEntries(entries, clientIdMap, orders) {
  entryMap.original = {};

  _.forEach(entries, function(entry) {
    var clientId = entry.clientId;

    if (!entry.id && typeof clientIdMap === 'object') {
      entry.id = clientIdMap[entry.clientId];
    }

    // `order` is the value the server stores, not a visual index. It is only used
    // when the user reorders, to work out which rows genuinely need renumbering.
    //
    // After a commit the caller passes `orders`, because the rows come from
    // getData(), which deliberately carries no order. Caching them as they are
    // would leave every untouched row order-less until the reload re-caches, and
    // a save made in that window predicts a mirrored sequence (PS-1781, #281).
    var order = entry.order;

    if (orders) {
      order = _.has(orders, entry.id) ? orders[entry.id] : orders[clientId];
    }

    entryMap.original[entry.id] = {
      id: entry.id,
      data: entry.data,
      order: order
    };
  });
}

/**
 * Clear the global timer and hides #alert-live-data
 * @returns {void}
 */
function clearLiveDataTimer() {
  clearTimeout(globalTimer);
  $('#alert-live-data').addClass('hidden');
}

/**
 * Tracks a global timer and renders the message in State A to display warning message
 * @returns {void}
 */
function startLiveDataTimer() {
  $('#alert-live-data').removeClass('hidden');
  $('#alert-live-data').html('Modifying data while live users are accessing the app may overwrite data. We recommend using admin screens within the app to modify data safely. \<a target="_blank" href="https://help.fliplet.com">Learn more\</a>');

  globalTimer = setTimeout(function() {
    $('#alert-live-data').html('Some of the data may have been changed by users of the app or other Studio users. Modifying data while live users are accessing the app may overwrite data. We recommend using admin screens within the app to modify data safely. \<a href="#" data-source-reload>Reload\</a> to see the latest version. \<a target="_blank" href="https://help.fliplet.com">Learn more\</a>');

    Fliplet.Studio.emit('track-event', {
      category: 'dsm_reload_warning',
      action: 'show'
    });
  }, 300000);
}

/**
 * Updates the pagination controls in the UI
 * @returns {void}
 */
function updatePaginationControls() {
  var $pagination = $('.pagination-controls');
  var pageInfo = Pagination.computePageInfo(totalEntries, PAGE_SIZE, currentPage);

  // Sync clamped page back
  currentPage = pageInfo.currentPage;
  totalPages = pageInfo.totalPages;

  $pagination.find('.pagination-info').text(
    pageInfo.startEntry + '–' + pageInfo.endEntry + ' of ' + pageInfo.totalEntries + ' entries'
  );
  // No page change while a save runs or a reload is needed (PS-2204, PS-2251):
  // the save writes the page it saved into the grid, which would then be
  // another page's grid, and a page change would discard rows still to copy
  $pagination.find('[data-page-prev]').prop('disabled', saveLock.isLocked() || !pageInfo.hasPrev);
  $pagination.find('[data-page-next]').prop('disabled', saveLock.isLocked() || !pageInfo.hasNext);
  $pagination.find('[data-page-jump]').val(pageInfo.currentPage + 1).attr('max', pageInfo.totalPages).prop('disabled', saveLock.isLocked());
  $pagination.find('[data-page-total]').text(pageInfo.totalPages);
  $pagination.toggleClass('hidden', totalEntries <= PAGE_SIZE);
}

/**
 * Navigate to a target page, with unsaved-changes confirmation if needed.
 * Shared by prev/next buttons and page-jump input.
 * @param {Number} targetPage - 0-based page index to navigate to
 * @returns {void}
 */
function navigateToPage(targetPage) {
  if (saveLock.isInFlight() || targetPage < 0 || targetPage >= totalPages || targetPage === currentPage) {
    return;
  }

  // Another page would replace the rows the user may still need to copy (PS-2251)
  if (saveLock.needsReload()) {
    alertReloadFirst();

    return;
  }

  function goToPage() {
    currentPage = targetPage;
    $('[data-page-prev], [data-page-next], [data-page-jump]').prop('disabled', true);
    showGridLoader('Loading page...');
    fetchCurrentDataSourceEntries();
  }

  if (table && table.hasChanges()) {
    Fliplet.Modal.confirm({
      message: 'You have unsaved changes. Navigating away will discard them. Continue?'
    }).then(function(result) {
      if (!result) {
        // Reset page-jump input to current page if user cancels
        $('[data-page-jump]').val(currentPage + 1);

        return;
      }

      table.setChanges(false);
      goToPage();
    });

    return;
  }

  goToPage();
}

// What a superseded fetch rejects with internally
var STALE_FETCH = { stale: true };

/**
 * Load the data source and rebuild the grid from it
 * @param {Array} [entries] - Entries to show instead of reading them
 * @param {Object} [options] - Settings, all optional
 * @param {Boolean} [options.rejectOnError] - Reject when loading fails. By
 *   default the error is shown under the grid and the promise resolves.
 * @returns {Promise} Settles once the grid has been rebuilt, or loading failed.
 *   Resolves without doing anything once a newer load has started.
 */
function fetchCurrentDataSourceEntries(entries, options) {
  // Only a load that starts now can show the server state a pending reload
  // is waiting for (PS-2251)
  var reloadToken = saveLock.beginReload();
  var thisFetch = ++fetchGeneration;
  // The data source this load is for, even if another one is opened meanwhile
  var dataSourceId = currentDataSourceId;

  // A newer load or a save has started: this one's answer may be older than
  // the one on screen, so it must not rebuild the grid or the cached originals
  function isStale() {
    return thisFetch !== fetchGeneration;
  }

  options = options || {};

  // A loader already showing keeps its message ("Loading page...", "Saving...")
  if ($('.page-loading-overlay').hasClass('hidden')) {
    showGridLoader('Loading data...');
  }

  // Edges of the page this fetch returns, cached together with its rows below
  var fetchedEdges = null;

  // Reuse existing connection if available, otherwise connect
  var connectionPromise = currentDataSource
    ? Promise.resolve(currentDataSource)
    : Fliplet.DataSources.connect(dataSourceId);

  return connectionPromise.then(function(source) {
    // Checked before taking the connection: saves commit through
    // currentDataSource, so a stale one would send them to the data source
    // this load was for, not the one on screen (PS-2251)
    if (isStale()) {
      return Promise.reject(STALE_FETCH);
    }

    clearLiveDataTimer();

    currentDataSource = source;

    return Fliplet.API.request({
      url: 'v1/data-sources/' + dataSourceId + '?includeEntriesCount',
      headers: { 'Cache-Control': 'no-cache' }
    }).then(function(response) {
      // Discard stale response if a newer fetch was started
      if (isStale()) {
        return Promise.reject(STALE_FETCH);
      }

      var dataSource = response.dataSource;
      var sourceName = dataSource.name;

      currentDataSourceUpdatedAt = TD(new Date(), { format: 'lll', locale: locale });

      $sourceContents.find('.editing-data-source-name').text(sourceName);

      columns = dataSource.columns || [];

      // Track total entries for pagination
      if (typeof dataSource.entriesCount === 'number') {
        totalEntries = dataSource.entriesCount;
      }

      if (entries) {
        return Promise.resolve(entries);
      }

      // Fetch only the current page of entries using the query endpoint.
      // The sort is the platform's own read order - the API's default, and the
      // sequence its renumber walks - so the manager reads a data source the same
      // way the rest of the platform does. Asking for id ASC here made rows with a
      // null or shared order appear in one sequence in the manager and the reverse
      // of it in apps, with nothing written down to reconcile them.
      //
      // The window is one row wider on each side than the page (PS-2204): the
      // row above and the row below are what a row added at the top or bottom of
      // the page is placed between. They are not shown.
      var fetchWindow = Pagination.computeFetchWindow(currentPage, PAGE_SIZE);

      return Fliplet.API.request({
        url: 'v1/data-sources/' + dataSourceId + '/data/query',
        method: 'POST',
        data: {
          limit: fetchWindow.limit,
          offset: fetchWindow.offset,
          order: [['order', 'ASC'], ['id', 'DESC']]
        }
      }).then(function(queryResponse) {
        // Discard stale response if a newer fetch was started
        if (isStale()) {
          return Promise.reject(STALE_FETCH);
        }

        var split = Pagination.splitFetchWindow(queryResponse.entries, currentPage, PAGE_SIZE);

        fetchedEdges = {
          offset: currentPage * PAGE_SIZE,
          before: split.before,
          after: split.after
        };

        return split.rows;
      }).catch(function(error) {
        if (error === STALE_FETCH) {
          return Promise.reject(error);
        }

        // Say what went wrong: a 500 or a dropped connection is not a
        // security rule refusing access (PS-2251)
        return Promise.reject(SaveState.classifyError(error, { defaultMessage: FETCH_ERROR_MESSAGE }));
      });
    });
  }).then(function(rows) {
    if (isStale()) {
      return Promise.reject(STALE_FETCH);
    }

    // lastRenderedPage is set inside renderSpreadsheet's waitUntilSized
    // callback below, not here — this .then() fires once the fetch itself
    // resolves, but the render can still be discarded by the sizing wait or
    // a newer navigation before anything is actually painted.
    if (dataSourceIsLive) {
      startLiveDataTimer();
    }

    // Cache entries in a new thread
    setTimeout(function() {
      if (!isStale()) {
        cacheOriginalEntries(rows);
        pageEdges = fetchedEdges;
      }
    }, 0);

    $('#show-versions').show();

    if ((!rows || !rows.length) && (!columns || !columns.length)) {
      showingDemoData = true;
      rows = _.times(DEMO_ROW_COUNT, function() {
        return { data: Object.assign({}, DEMO_ROW_DATA) };
      });
      columns = ['Column 1', 'Column 2'];
      demoColumns = true;
    } else {
      showingDemoData = false;
      demoColumns = false;

      var flattenedColumns = {};

      rows.map(function(row) {
        return row.data;
      }).forEach(function(dataItem) {
        Object.assign(flattenedColumns, dataItem);
      });

      var computedColumns = _.keys(flattenedColumns);

      if (computedColumns.length !== columns.length) {
        // TODO: Add tracking to verify how often this happens and why
        // Missing column found
      }

      columns = _.uniq(_.concat(columns, computedColumns));
    }

    // rows is only the current page (PAGE_SIZE at most) since pagination — totalEntries
    // is the true data-source-wide count and is what the Versions tab should reflect.
    // Note: entriesCount is read from an API read-replica, so immediately after a
    // save it can briefly lag by one — cosmetic, not worth chasing as a bug.
    currentDataSourceRowsCount = totalEntries;
    currentDataSourceColumnsCount = columns.length;

    // On initial load, create an empty spreadsheet as this speeds up subsequent loads
    if (initialLoad) {
      if (table) {
        table.destroy();
      }

      table = spreadsheet({ columns: columns, rows: [], initialLoad: true, isLocked: isSaveLocked });

      requestAnimationFrame(function() {
        // The newer load builds the grid instead
        if (isStale()) {
          return;
        }

        table.destroy();
        table = null;
        initialLoad = false;
        renderSpreadsheet(rows, thisFetch, reloadToken);
      });
    } else {
      // From here until renderSpreadsheet's sizing wait builds the new grid (up
      // to 2s), there is no table, so the `table && table.hasChanges()` guards
      // skip their "unsaved changes" confirm. Nothing is lost by that: every
      // caller of this fetch has either just saved, already confirmed with the
      // user (page change, tab change), or is a reload the user asked for
      // (Reload, import, version restore). Until the new grid shows there is
      // nothing to edit, so there are no changes for a guard to protect.
      if (table) {
        table.destroy();
        table = null;
      }

      renderSpreadsheet(rows, thisFetch, reloadToken);
    }
  })
    .catch(function onFetchError(error) {
      // Superseded by a newer load, which reports its own outcome
      if (error === STALE_FETCH || isStale()) {
        return;
      }

      var message;

      if (error instanceof Error) {
        message = FETCH_ERROR_MESSAGE;

        if (typeof Raven !== 'undefined') {
          Raven.captureException(error, { extra: { dataSourceId: dataSourceId } });
        }
      } else {
        // A jqXHR from any of the requests above, or one the query already sorted.
        // Written as it was, a jqXHR showed as "[object Object]".
        var failure = error && error.kind
          ? error
          : SaveState.classifyError(error, { defaultMessage: FETCH_ERROR_MESSAGE });

        message = failure.message;

        if (typeof Raven !== 'undefined') {
          Raven.captureMessage('Error accessing data source', { extra: { dataSourceId: dataSourceId, status: failure.status, error: message } });
        }
      }

      $('.entries-message').html('<br>' + _.escape(message));
      hideGridLoader();

      // A stale error never reaches here — the guard at the top of onFetchError
      // already returned for it — so there is no staleness left to decide on.
      // The rollback itself still goes through the shared function so there's
      // one tested source of truth for it.
      var recovery = Pagination.resolveFetchErrorRecovery(lastRenderedPage);

      currentPage = recovery.currentPage;
      lastRenderedPage = recovery.lastRenderedPage;
      updatePaginationControls();

      if (options.rejectOnError) {
        return Promise.reject(error);
      }
    });
}

function previewVersion(version) {
  $('#versions-details').addClass('hidden');

  // Read entries in the version
  Fliplet.API.request('v1/data-sources/' + currentDataSourceId + '/versions/' + version.id + '/data').then(function(result) {
    var entries = result.entries.map(function(entry) {
      return version.data.columns.map(function(column) {
        return entry.data[column];
      });
    });

    var tpl = Fliplet.Widget.Templates['templates.version'];
    var html = tpl({
      version: version,
      columns: version.data.columns,
      entries: entries
    });

    $versionContents.html(html).removeClass('hidden');
  }).catch(console.error);
}

function getVersionActionDescription(version) {
  if (!version.user) {
    // This can happen if the user is hard deleted from DB
    version.user = { fullName: 'a deleted user' };
  }

  switch (version.data.action) {
    case 'commit':
      return 'Changes made by ' + version.user.fullName;
    case 'pre-restore':
      return 'Version restored by ' + version.user.fullName;
    case 'current':
      return 'This is the current version of the data source, last updated by ' + version.user.fullName;
    case 'snapshot':
      return 'Automatic snapshot taken by the system';
    default:
      return version.data.action || 'Description not available';
  }
}

function fetchCurrentDataSourceVersions() {
  $versionContents.html('Please wait while versions are loaded...');

  Fliplet.API.request('v1/data-sources/' + currentDataSourceId + '/versions')
    .then(function(result) {
      currentDataSourceVersions = result.versions;

      var versions = currentDataSourceVersions.map(function(version) {
        version.createdAt = TD(version.createdAt, { format: 'lll', locale: locale });
        version.action = getVersionActionDescription(version);
        version.entriesCount = _.get(version, 'data.entries.count', 'Unknown');
        version.hasEntries = version.entriesCount > 0;
        version.columnsCount = version.data.columns && version.data.columns.length || 'Not defined';

        return version;
      });

      var tpl = Fliplet.Widget.Templates['templates.versions'];
      var html = tpl({
        action: versions.length ? getVersionActionDescription({
          data: { action: 'current' },
          user: versions[0].user
        }) : 'No versions for this data source',
        updatedAt: currentDataSourceUpdatedAt,
        entriesCount: currentDataSourceRowsCount,
        columnsCount: currentDataSourceColumnsCount,
        versions: versions
      });

      $versionsContents.html(html);
      $('#versions-details').removeClass('hidden');
    }).catch(function(err) {
      console.error(err);

      Fliplet.Modal.alert({
        title: 'Error reading the list of versions for this data source',
        message: Fliplet.parseError(err)
      });

      $('#show-entries').click();
    });
}

Fliplet.Widget.onSaveRequest(function() {
  // After a save already running, so the two never overlap (PS-2204)
  var previous = saveInProgress;

  return Promise.resolve(previous).catch(_.noop).then(function(previousResult) {
    return saveCurrentData().then(function(result) {
      // The grid is still being rebuilt after the save that just finished (its
      // render waits for the Entries tab to be sized), so there is no table and
      // nothing can have changed since: close with that save's result
      return result === SAVE_SKIPPED && previous ? previousResult : result;
    });
  }).then(function(result) {
    // Cancelled from the duplicate rows prompt: stay open with the edits.
    // Already saving, a reload needed, or nothing open: nothing was sent.
    if (result === SAVE_CANCELLED || result === SAVE_BUSY || result === SAVE_SKIPPED) {
      return;
    }

    return Fliplet.Widget.complete(result === SAVED_NOT_REFRESHED ? undefined : result);
  }).catch(function(error) {
    // Not saved, or not known to be: stay open
    try {
      onSaveFailed(error);
    } catch (e) {
      // Last resort: reporting the failure itself failed, and Studio shows nothing
      // eslint-disable-next-line no-console
      console.error(e);
    }
  });
});

/**
 * Remove null values of the row that we do not save padding columns
 * @param {Array} columns - Columns to be assessed
 * @returns {Array} Columns to be saved
 */
function trimColumns(columns) {
  return _.filter(columns, function(column) {
    return column !== null;
  });
}

function toggleSortedIcon(column) {
  if ($activeSortedColumn) {
    $activeSortedColumn.removeClass('sorted');
  }

  $activeSortedColumn = column.addClass('sorted');
}

function getEmptyColumns(columns, entries) {
  var emptyColumns = _.filter(columns, function(column) {
    return emptyColumnNameRegex.test(column);
  });

  if (!emptyColumns.length) {
    return [];
  }

  _.forEach(entries, function(entry) {
    // Stop iteration through entries if all empty columns have values (removed from array)
    if (!emptyColumns.length) {
      return false;
    }

    var column;

    for (var i = emptyColumns.length - 1; i >= 0; i--) {
      column = emptyColumns[i];

      if ([null, undefined, ''].indexOf(entry.data[column]) !== -1) {
        continue;
      }

      var notEmptyColumnIndex = emptyColumns.indexOf(column);

      if (notEmptyColumnIndex !== -1) {
        emptyColumns.splice(notEmptyColumnIndex, 1);
      }
    }
  });

  return emptyColumns;
}

function removeEmptyColumnsInEntries(entries, emptyColumns) {
  return entries.map(function(entry) {
    entry.data = _.omitBy(entry.data, function(value, key) {
      return emptyColumns.includes(key);
    });

    return entry;
  });
}

/**
 * Computes payload for the commit API by comparing a list of entries against the cached original entries
 * @param {Array} entries - Latest entries to be committed
 * @returns {Object} List of new/updated entries and deleted IDs
 */
/**
 * Build the list of new/updated entries and deleted IDs for a commit.
 * The comparison itself lives in js/entry-diff.js so it can be unit tested.
 * @param {Array} entries - List of entries from the table, in visual order
 * @returns {Object} List of new/updated entries and deleted IDs
 */
function getCommitPayload(entries) {
  return EntryDiff.computeCommitPayload(entries, entryMap.original, {
    // Position is only worth writing when the user dragged a row during this save
    rowsMoved: !!(table && typeof table.hasRowsMoved === 'function' && table.hasRowsMoved()),
    // ...and only when the grid is showing the stored sequence. Under a column
    // sort the visible order is not an arrangement anyone asked to persist.
    viewMatchesStoredOrder: !(table && typeof table.isColumnSorted === 'function' && table.isColumnSorted()),
    // The grid is one page of the data source (PS-2204). Without this, EntryDiff
    // takes the page to be the whole data source and numbers a new row from the
    // top of it, so the row reloads on the first page instead of where it was put.
    // Offset and edges come from the same fetch as the cached rows, so they
    // always describe the page the save is comparing against.
    page: pageEdges ? {
      offset: pageEdges.offset,
      liveCount: totalEntries,
      before: pageEdges.before,
      after: pageEdges.after
    } : null,
    isEqual: _.isEqual,
    guid: Fliplet.guid
  });
}

// What saveCurrentData() resolves with when the user declines to save
var SAVE_CANCELLED = { cancelled: true };

// ...and when nothing new was started: a save is running or a reload is needed
var SAVE_BUSY = { busy: true };

// ...and when no data source is open, so there is nothing to save
var SAVE_SKIPPED = { skipped: true };

// ...and when the commit was confirmed but the grid could not be reloaded
var SAVED_NOT_REFRESHED = { saved: true, refreshed: false };

var FETCH_ERROR_MESSAGE = 'Error loading data source.';
var SAVE_ERROR_MESSAGE = 'Error saving data source.';
var COLUMNS_CHANGED_MESSAGE = 'A column was renamed or deleted elsewhere. Reload before editing.';

// Whether a save is in flight, or a save that may have landed left the grid
// out of step with the server. Either way nothing may be saved (PS-2251).
var saveLock = SaveState.createSaveLock();

/**
 * Whether the grid must not change. Handed to the grid, which is read-only
 * while this is true.
 * @returns {Boolean} True while saving or until a needed reload
 */
function isSaveLocked() {
  return saveLock.isLocked();
}

/**
 * Show a save notice above the data source. It wraps at any width, unlike
 * the status next to the name, which the toolbar overlaps (PS-2251).
 * @param {String} message - Text to show
 * @param {Boolean} [withReload] - Add a link that reloads the data source
 * @returns {undefined}
 */
function showSaveNotice(message, withReload) {
  var $notice = $('#alert-save-notice').removeClass('hidden').text(message);

  if (withReload) {
    $notice.append(' ', $('<a href="#" data-source-reload></a>').text('Reload'));
  }
}

/**
 * Tell the user an action is blocked until they reload the data source
 * @returns {Promise} Resolves once the alert is closed
 */
function alertReloadFirst() {
  return Fliplet.Modal.alert({
    title: 'Reload required',
    message: 'Your last save couldn\'t be confirmed. Copy anything you need, then Reload the data source before doing this.'
  });
}

/**
 * Hide the save notice
 * @returns {undefined}
 */
function hideSaveNotice() {
  $('#alert-save-notice').addClass('hidden').empty();
}

/**
 * Show Save when there is something to save, nothing blocks it and the
 * entries are on screen (the other tabs hide it)
 * @returns {undefined}
 */
function refreshSaveButton() {
  if (!saveLock.isLocked() && table && table.hasChanges() && $('#entries').hasClass('active')) {
    $('.save-btn').removeClass('hidden');
  }
}

/**
 * Bring the grid, Save and the save notice in line with the save lock
 * @returns {undefined}
 */
function renderSaveLock() {
  if (table && typeof table.applyLock === 'function') {
    table.applyLock();
  }

  $('[data-save]').prop('disabled', saveLock.isLocked());

  if (saveLock.isLocked()) {
    $('.save-btn').addClass('hidden');
  } else {
    refreshSaveButton();
  }

  if (saveLock.needsReload()) {
    // The notice says why. "Saving..." next to the name would contradict it.
    $('.data-save-status').addClass('hidden').empty();
    showSaveNotice(saveLock.reason(), true);
  } else if (!saveLock.isInFlight()) {
    hideSaveNotice();
  }

  // The page buttons follow the lock too (PS-2204)
  updatePaginationControls();
}

/**
 * Block saving until the data source is reloaded
 * @param {String} message - Why, shown with a Reload link
 * @returns {undefined}
 */
function requireReload(message) {
  saveLock.requireReload(message);
  renderSaveLock();
}

/**
 * The grid was rebuilt from the server by a load that started with this token
 * @param {Number} reloadToken - From saveLock.beginReload()
 * @returns {undefined}
 */
function onGridReloaded(reloadToken) {
  saveLock.reloaded(reloadToken);
  renderSaveLock();
}

/**
 * Reload the grid from the server, giving up after RELOAD_TIMEOUT_MS
 * @returns {Promise} Rejects when loading failed or took too long
 */
function reloadGrid() {
  return SaveState.withTimeouts(fetchCurrentDataSourceEntries(undefined, { rejectOnError: true }), {
    hardMs: SaveState.RELOAD_TIMEOUT_MS
  });
}

/**
 * A save that may have been applied. Keep the user's rows on screen,
 * read-only so they can be copied, and block saving until a reload shows
 * what the server has: saving them again could insert them twice.
 * @param {Object} failure - From SaveState.classifyError()
 * @returns {Promise} Rejects with the failure, marked unconfirmed
 */
function onUnconfirmedSave(failure) {
  failure.unconfirmed = true;
  requireReload(SaveState.unconfirmedMessage(failure));

  return Promise.reject(failure);
}

/**
 * Report a save that failed. A save that may have landed has already said
 * so and asked for a reload; anything else was not applied, so the rows
 * stay and Save comes back for a retry.
 * @param {*} error - Rejection from saveCurrentData()
 * @returns {undefined}
 */
function onSaveFailed(error) {
  if (error && error.unconfirmed) {
    return;
  }

  // A column this grid's rows use was renamed or deleted somewhere else
  // (PS-2204). The edits are still on screen, but the columns under them are
  // no longer the server's, so saving them again would be refused too.
  if (error && error.status === 409) {
    Fliplet.Modal.alert({
      title: 'Changes not saved',
      message: 'Someone renamed or deleted a column in this data source while you were editing it, maybe in another tab. Copy anything you need, then Reload to see the latest version and make your changes again.'
    });

    if (table) {
      table.onSaveError();
    }

    requireReload(COLUMNS_CHANGED_MESSAGE);

    return;
  }

  var original = error && error.kind ? error.error : error;

  if (!Fliplet.Error.isHandled(original)) {
    Fliplet.Modal.alert({
      title: 'Error saving data source',
      message: error && error.kind ? error.message : Fliplet.parseError(error)
    });
  }

  if (table) {
    table.setChanges(true);
    table.onSaveError();
  }

  renderSaveLock();
}

/**
 * Save the grid. Only one save runs at a time: while one is in flight, or a
 * reload is needed, this resolves with SAVE_BUSY and sends nothing.
 * @returns {Promise} Resolves with SAVE_CANCELLED when the user cancels, or
 *   rejects once the save has failed (see commitCurrentData)
 */
function saveCurrentData() {
  // Nothing is open, so there is nothing to save
  if (!table) {
    return Promise.resolve(SAVE_SKIPPED);
  }

  if (!saveLock.start()) {
    return Promise.resolve(SAVE_BUSY);
  }

  // A load already running, such as a Reload clicked just before Save, would
  // otherwise rebuild the grid mid-save and replace the rows being saved
  // (PS-2251). The save reloads the grid itself once the commit is confirmed.
  // That load's cover comes down with it: it never renders, so nothing else
  // would, and a cancelled save would leave the grid covered. The page it was
  // loading never shows either, so the page bar goes back to the page on screen.
  fetchGeneration++;
  hideGridLoader();
  currentPage = Pagination.resolveFetchErrorRecovery(lastRenderedPage).currentPage;

  var saving;

  renderSaveLock();

  try {
    saving = Promise.resolve(confirmAndCommit());
  } catch (error) {
    saving = Promise.reject(error);
  }

  saveInProgress = saving.then(function(result) {
    saveLock.finish();
    renderSaveLock();

    return result;
  }, function(error) {
    saveLock.finish();
    renderSaveLock();

    return Promise.reject(error);
  });

  return saveInProgress;
}

/**
 * Commit the grid, first asking whether new rows that are exact copies of
 * other rows should be saved. A fill-handle drag or paste into the spare rows
 * makes such copies, and without asking they were inserted silently (PS-2251).
 * @returns {Promise} Resolves with SAVE_CANCELLED when the user cancels
 */
function confirmAndCommit() {
  if (!table) {
    return commitCurrentData();
  }

  // The same call the commit makes, so the entries can be handed on to it
  var entries = table.getData({
    parseJSON: true,
    removeEmptyRows: true
  });
  var duplicates = DuplicateRows.find(entries, DuplicateRows.gridRowNumbers(hot ? hot.getData().slice(1) : []), {
    placeholderValue: showingDemoData ? DEMO_ROW_VALUE : undefined,
    placeholderRows: DEMO_ROW_COUNT
  });

  if (!duplicates.count) {
    return commitCurrentData(entries);
  }

  return Fliplet.Modal.confirm({
    message: DuplicateRows.message(duplicates),
    buttons: {
      cancel: {
        label: 'Cancel'
      },
      confirm: {
        label: 'Save anyway'
      }
    }
  }).then(function(confirmed) {
    // Commit the rows the user was asked about, not a fresh read of the grid
    return confirmed ? commitCurrentData(entries) : SAVE_CANCELLED;
  });
}

/**
 * Commit the grid to the data source
 * @param {Array} [entries] - Entries already read with the options below
 * @returns {Promise} Resolves once the grid has been reloaded
 */
function commitCurrentData(entries) {
  var columns;

  // No reload here: the payload is built from the cached originals, and a
  // reload mid-save rebuilt the grid from the server, wiping the rows being
  // saved and bringing Save back while the commit was still running (PS-2251)
  table.onSave();

  entries = entries || table.getData({
    parseJSON: true,
    removeEmptyRows: true
  });

  // If we don't have data we might also have no columns
  // Check if all columns are empty and clear them on the data source
  // This way next load will load demo data
  if (!entries.length) {
    columns = table.getColumns({ raw: true });

    if (_.some(columns)) {
      columns = table.getColumns();
    } else {
      columns = [];
    }
  } else {
    columns = trimColumns(table.getColumns());
  }

  // Get the empty columns from assessing all entries. A paginated grid holds one
  // page, and a column that is empty here can hold data on another page, so it
  // is left alone - removing it now deletes it from every page (PS-2204).
  var emptyColumns = totalEntries > PAGE_SIZE ? [] : getEmptyColumns(columns, entries);

  // Remove empty columns from the table. The grid position comes from the grid:
  // `columns` leaves out header-less columns, so with one to the left its index
  // points at the neighbouring column, which would be removed and then deleted
  // from every row as a deleted column (PS-2204).
  _.forEach(emptyColumns, function(column) {
    var gridIndex = table.getColumns().indexOf(column);
    var columnIndex = columns.indexOf(column);

    if (gridIndex !== -1) {
      hot.alter('remove_col', gridIndex, 1, 'removeEmptyColumn');
    }

    if (columnIndex !== -1) {
      columns.splice(columnIndex, 1);
    }
  });

  // Remove empty columns in entries
  if (entries.length && emptyColumns.length) {
    entries = removeEmptyColumnsInEntries(entries, emptyColumns);
  }

  var widths = trimColumns(table.getColWidths());

  // Update column sizes in background
  Fliplet.DataSources.getById(currentDataSourceId).then(function(dataSource) {
    dataSource.definition = dataSource.definition || {};
    dataSource.definition.columnsWidths = widths;

    return Fliplet.DataSources.update(currentDataSourceId, { definition: dataSource.definition });
  }).catch(console.error);

  currentDataSourceUpdatedAt = TD(new Date(), { format: 'lll', locale: locale });

  var payload = getCommitPayload(entries);
  var commitData = {
    entries: payload.entries,
    delete: payload.delete,
    columns: columns,
    returnEntries: false
  };

  // The entries carry only this page's rows (PS-2204). Renamed and deleted
  // columns are sent as such, so the API applies them to every row in the data
  // source; otherwise the other pages keep the old column and it comes back.
  var columnChanges = table.getColumnChanges();

  if (columnChanges.renameColumns.length) {
    commitData.renameColumns = columnChanges.renameColumns;
  }

  if (columnChanges.deleteColumns.length) {
    commitData.deleteColumns = columnChanges.deleteColumns;
  }

  if (columnChanges.expectColumns.length) {
    commitData.expectColumns = columnChanges.expectColumns;
  }

  // Only when the stored orders cannot seat the rows this save is placing. The
  // API renumbers every live entry over its own read order before applying the
  // payload, which is what lets the payload be the rows the user touched rather
  // than the whole data source (PS-1781).
  if (payload.normalizeOrder) {
    commitData.normalizeOrder = payload.normalizeOrder;
  }

  // Covers the grid until the reload after the commit shows the saved rows
  // (PS-2204). Lifted on failure, so the rows typed can still be copied.
  showGridLoader('Saving...');

  // No client-side ceiling: the lock holds until the commit settles, which
  // the server bounds. Giving up early let a late commit land unnoticed.
  return SaveState.withTimeouts(currentDataSource.commit(commitData), {
    softMs: SaveState.SOFT_TIMEOUT_MS,
    onSoft: function() {
      showSaveNotice(SaveState.SLOW_MESSAGE);
    }
  }).then(function(response) {
    try {
      var clientIds = [];
      var ids = [];

      // Generate an object mapping client IDs to new entry IDs
      _.forEach(response.clientIds, function(entry) {
        clientIds.push(entry.clientId);
        ids.push(entry.id);
      });

      var clientIdMap = _.zipObject(clientIds, ids);

      cacheOriginalEntries(entries, clientIdMap, payload.orders);

      // The columns this save renamed or deleted are now the saved ones
      table.markColumnsSaved(columnChanges.saved);

      if (pageEdges && payload.pageEdges) {
        pageEdges = {
          offset: pageEdges.offset,
          before: payload.pageEdges.before,
          after: payload.pageEdges.after
        };
      }

      table.setData({ columns: columns, rows: entries });
      table.clearRowsMoved();
    } catch (error) {
      hideGridLoader();

      // Saved, but the new ids were not recorded: a retry would insert again
      return onUnconfirmedSave({ kind: 'ambiguous', error: error });
    }

    showGridLoader('Loading data...');

    // After the reload, not before: loading the entries clears this element,
    // so a notice written any earlier is wiped by the refresh that proves it.
    return reloadGrid().then(function(result) {
      var notice = CommitNotice.forDeclined(payload.declined);

      if (notice && table && typeof table.showNotice === 'function') {
        table.showNotice(notice);
      }

      // Hand back what the reload resolved with - onSaveRequest passes it
      // straight to Fliplet.Widget.complete
      return result;
    }, function() {
      hideGridLoader();

      // Saved, but the grid's rows lack the new ids, so saving again from it
      // would insert them twice
      requireReload(SaveState.SAVED_NOT_REFRESHED_MESSAGE);

      return SAVED_NOT_REFRESHED;
    });
  }, function(error) {
    hideGridLoader();

    var failure = SaveState.classifyError(error, {
      defaultMessage: SAVE_ERROR_MESSAGE,
      operation: 'commit'
    });

    // The server refused it, so nothing was written: keep the rows for a retry
    if (failure.kind === 'definitive') {
      return Promise.reject(failure);
    }

    // It may have been written
    return onUnconfirmedSave(failure);
  });
}

// Append a data source to the DOM
function getDataSourceRender(data) {
  var tpl = Fliplet.Widget.Templates['templates.dataSource'];
  var html = '';

  if (Array.isArray(data.apps)) {
    data.apps = _.uniqBy(data.apps, function(app) {
      return app.id;
    });
  }

  html = tpl(data);

  return html;
}

function getTrashSourceRender(data) {
  var tpl = Fliplet.Widget.Templates['templates.trashSource'];
  var html = '';

  html = tpl(data);

  return html;
}

function windowResized() {
  $('.tab-pane').height($('body').outerHeight() - $('.tab-content').offset().top);
  $('.table-entries').height($('.tab-content').height());
}

function browseDataSource(id) {
  currentDataSourceId = id;
  $contents.addClass('hidden');
  $('.settings-btns').removeClass('active');

  // Hide nav tabs and tooltip bar
  var tab = $sourceContents.find('ul.nav.nav-tabs li');

  tab.each(function(index) {
    if (!tab[index].classList[0]) {
      $(tab[index]).hide();
    }
  });

  $versionContents.html('');
  $sourceContents.find('#toolbar').hide();
  $initialSpinnerLoading.addClass('animated');
  $sourceContents.removeClass('hidden');

  // Input file temporarily disabled
  // $contents.append('<form>Import data: <input type="file" /></form><hr /><div id="entries"></div>');

  return Promise.all([
    fetchCurrentDataSourceEntries(),
    fetchCurrentDataSourceDetails()
  ]).then(function() {
    windowResized();

    if (widgetData.context === 'overlay') {
      Fliplet.DataSources.get({
        attributes: 'id,name,bundle,createdAt,updatedAt,appId,apps',
        roles: 'publisher,editor',
        type: null,
        excludeTypes: 'bookmarks,likes,comments,menu,conversation'
      }, {
        cache: false
      })
        .then(function(updatedDataSources) {
          var html = [];

          dataSources = updatedDataSources;
          dataSources.forEach(function(dataSource) {
            html.push(getDataSourceRender(dataSource));
          });
          $dataSources.html(html.join(''));

          // Show security rules
          if (widgetData.view === 'access-rules') {
            $('#show-access-rules').click();
            addSecurityRule();
          }
        });
    }
  })
    .catch(function() {
    // Something went wrong
    // EG: User try to edit an already deleted data source
    // TODO: Show some error message

      // Ensure .table-entries still gets sized even though the
      // Promise.all().then() branch that normally does this was skipped -
      // otherwise any pending waitUntilSized() gate would poll forever.
      windowResized();
      getDataSources();
    });
}

function createDataSource(createOptions, options) {
  createOptions = createOptions || {};
  options = options || {};

  return Fliplet.Modal.prompt({
    title: 'Enter the name of your new Data Source',
    value: _.get(options, 'name', ''),
    maxlength: 255
  }).then(function(result) {
    if (result === null) {
      return;
    }

    var dataSourceName = result.replace(/<.+>/g, '').trim();

    if (!dataSourceName) {
      return Fliplet.Modal.alert({
        message: 'You must enter a data source name'
      }).then(function() {
        return createDataSource(createOptions, options);
      });
    }

    $('[data-show-source]').addClass('active-source');
    $('[data-show-trash-source]').removeClass('active-source');

    // Simulate going back to the "all datasources" list
    if (createOptions.version) {
      $('#show-entries').click();

      try {
        table.destroy();
      } catch (e) {
        // Fail silently
      }

      $('[data-order-date]').removeClass('asc').addClass('desc');
    }

    // Get current organization in Studio via session
    Fliplet.User.getCachedSession().then(function(session) {
      if (widgetData.appId) {
        _.extend(createOptions, {
          appId: widgetData.appId,
          name: dataSourceName
        });
      } else {
        _.extend(createOptions, {
          organizationId: session && session.organizationId,
          name: dataSourceName
        });
      }

      return Fliplet.DataSources.create(createOptions);
    }).then(function(createdDataSource) {
      if (createOptions.version) {
        Fliplet.Modal.alert({
          title: 'Version copied successfully',
          message: 'The version has been restored to your newly created data source.'
        });
      }

      dataSources.push(createdDataSource);
      $dataSources.append(getDataSourceRender(createdDataSource));

      return browseDataSource(createdDataSource.id);
    })
      .catch(function(error) {
        if (Fliplet.Error.isHandled(error)) {
          return;
        }

        Fliplet.Modal.alert({
          message: Fliplet.parseError(error)
        })
          .then(function() {
            return createDataSource(createOptions, options);
          });
      });
  });
}

function activateFind() {
  // Returns TRUE if an action is carried out

  // Data sources list view
  if (!$contents.hasClass('hidden')) {
    $('.search').focus();

    return true;
  }

  // Data source view
  switch ($sourceContents.find('.tab-pane.active').attr('id')) {
    case 'entries':
      hot.deselectCell();
      searchField.focus();

      return true;
    default:
      return false;
  }
}

function restoreDataSource(id, name) {
  Fliplet.API.request({
    url: 'v1/data-sources/' + id + '/restore',
    method: 'POST'
  }).then(function() {
    $('.data-source[data-id="' + id + '"]').remove();

    trashedDataSources = trashedDataSources.filter(function(ds) {
      return ds.id !== id;
    });

    Fliplet.Modal.alert({
      title: 'Restore complete',
      message: '"' + name + '" restored'
    });
  }).catch(function(error) {
    Fliplet.Modal.alert({
      title: 'Restore failed',
      message: Fliplet.parseError(error)
    });
  });

  currentDataSourceId = 0;
}

function deleteDataSource(id, name) {
  Fliplet.Modal.prompt({
    title: '<p>Delete data source</p><br/><span>Enter the data source name <code>' + name + '</code> to confirm.</span>',
    value: null,
    maxlength: 255,
    buttons: {
      confirm: {
        label: 'Delete data source',
        className: 'btn-danger'
      },
      cancel: {
        label: 'Cancel',
        className: 'btn-default'
      }
    }
  }).then(function(result) {
    if (result === null) {
      return;
    }

    if (result === name.toString()) {
      Fliplet.API.request({
        url: 'v1/data-sources/deleted/' + id,
        method: 'DELETE'
      }).then(function() {
        // Remove from UI
        $('.data-source[data-id="' + id + '"]').remove();

        // Remove from trashedDataSources
        trashedDataSources = trashedDataSources.filter(function(ds) {
          return ds.id !== id;
        });

        Fliplet.Modal.alert({
          title: 'Deletion complete',
          message: '1 data source deleted permanently.'
        });

        // Return to parent widget if in overlay
        if (widgetData.context === 'overlay') {
          Fliplet.Studio.emit('close-overlay');

          return;
        }
      }).catch(function(error) {
        Fliplet.Modal.alert({
          title: 'Deletion failed',
          message: Fliplet.parseError(error)
        });
      });

      currentDataSourceId = 0;

      return;
    }

    Fliplet.Modal.alert({
      title: 'Deletion failed',
      message: 'Data source name is incorrect'
    }).then(function() {
      deleteDataSource(id, name);
    });

    currentDataSourceId = 0;
  });
}

function deleteItem(message, dataSourceId) {
  Fliplet.Modal.confirm({
    message: message
  }).then(function(confirmAlert) {
    if (!confirmAlert) {
      return;
    }

    Fliplet.DataSources.delete(dataSourceId).then(function() {
      // Remove from UI
      $('.data-source[data-id="' + dataSourceId + '"]').remove();

      // Remove from dataSources
      dataSources = dataSources.filter(function(ds) {
        return ds.id !== dataSourceId;
      });

      allDataSources = allDataSources.filter(function(ds) {
        return ds.id !== dataSourceId;
      });

      if (!dataSources.length) {
        $noResults.removeClass('hidden');
      }

      // Return to parent widget if in overlay
      if (widgetData.context === 'overlay') {
        Fliplet.Studio.emit('close-overlay');

        return;
      }

      if (!$sourceContents.hasClass('hidden')) {
        // Go back
        $('[data-back]').click();
      }
    });

    currentDataSourceId = 0;
  });
}

function sortDataSources(key, order, data) {
  var toBeOrderedDataSources = data;

  if ((widgetData.context === 'app-overlay' || widgetData.appId) && isShowingAll && key !== 'deletedAt') {
    toBeOrderedDataSources = allDataSources;
  }

  var orderedDataSources = _.orderBy(toBeOrderedDataSources, function(ds) {
    switch (key) {
      case 'updatedAt':
        return new Date(ds[key]).getTime();
      case 'deletedAt':
        return new Date(ds[key]).getTime();
      case 'name':
        var dataSourceName = ds[key].toUpperCase();

        // Show data source which starts on the letter first
        return /[A-Za-z]/.test(dataSourceName[0])
          ? dataSourceName
          : '{' + dataSourceName;
      default:
        break;
    }
  }, [order]);

  return orderedDataSources;
}

Handlebars.registerHelper('momentCalendar', function(date) {
  return TD(date, { format: 'lll', locale: locale });
});

// Events

// Prevent Cmd + F default behavior and use our find
window.addEventListener('keydown', function(event) {
  // Just the modifiers
  if ([16, 17, 18, 91, 93].indexOf(event.keyCode) > -1) {
    return;
  }

  var ctrlDown = (event.ctrlKey || event.metaKey);

  // Cmd/Ctrl + F
  if (ctrlDown && !event.altKey && !event.shiftKey && event.keyCode === 70) {
    if (activateFind()) {
      event.preventDefault();
    }

    return;
  }
});

// Capture browser-find event from outside the iframe to trigger find
window.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'browser-find') {
    activateFind();
  }
}, false);

$(window).on('resize', windowResized).trigger('resize');
$('#app')
  .on('click', '[data-order-date]', function() {
    var $dataSource = $(this);
    var defaultOrder = $(this).data('defaultOrder');

    renderDataSources(sortColumn($dataSource, 'updatedAt', dataSources, defaultOrder));
  })
  .on('click', '[data-trash-deleted-date]', function() {
    var $dataSource = $(this);
    var defaultOrder = $(this).data('defaultOrder');

    renderTrashedDataSources(sortColumn($dataSource, 'deletedAt', trashedDataSources, defaultOrder));
  })
  .on('click', '[data-trash-date]', function() {
    var $dataSource = $(this);
    var defaultOrder = $(this).data('defaultOrder');

    renderTrashedDataSources(sortColumn($dataSource, 'updatedAt', trashedDataSources, defaultOrder));
  })
  .on('click', '[data-order-name]', function() {
    var $dataSource = $(this);
    var defaultOrder = $(this).data('defaultOrder');

    renderDataSources(sortColumn($dataSource, 'name', dataSources, defaultOrder));
  })
  .on('click', '[data-trash-name]', function() {
    var $dataSource = $(this);
    var defaultOrder = $(this).data('defaultOrder');

    renderTrashedDataSources(sortColumn($dataSource, 'name', trashedDataSources, defaultOrder));
  })
  .on('click', '[data-show-all-source]', function() {
    $btnShowAllSource.addClass('hidden');
    $('[data-app-source]').removeClass('hidden');
    $noResults.toggleClass('hidden', dataSources.length);

    if ($('[data-show-trash-source]').hasClass('active-source')) {
      isShowingAll = false;

      $('[data-show-trash-source]').click();
    } else {
      isShowingAll = true;
      getDataSources();
    }
  })
  .on('click', '[data-app-source]', function() {
    isShowingAll = false;

    $('[data-app-source]').addClass('hidden');
    $btnShowAllSource.removeClass('hidden');
    $noResults.toggleClass('hidden', dataSources.length);

    if ($('[data-show-trash-source]').hasClass('active-source')) {
      $('[data-show-trash-source]').click();
    } else {
      getDataSources();
    }
  })
  .on('click', '[data-source-reload]', function(event) {
    event.preventDefault();

    // Rebuilding the grid mid-save wipes the rows being saved (PS-2251). When
    // a reload is needed, this is how the user gets one.
    if (saveLock.isInFlight()) {
      return;
    }

    // This link is also the reload an unconfirmed save asks for; only the
    // live-data warning's reload is tracked
    var isLiveDataReload = !saveLock.needsReload();

    $('.save-btn').addClass('hidden');

    fetchCurrentDataSourceEntries();

    if (isLiveDataReload) {
      Fliplet.Studio.emit('track-event', {
        category: 'dsm_reload_warning',
        action: 'reload'
      });
    }
  })
  .on('click', '[data-back]', function(event) {
    event.preventDefault();

    // Leaving destroys the grid the save is working from
    if (saveLock.isInFlight()) {
      return;
    }

    // ...or the rows the user may still need to copy (PS-2251)
    if (saveLock.needsReload()) {
      alertReloadFirst();

      return;
    }

    $('[href="#entries"]').click();

    function resetAndGoBack() {
      // Reset pagination and connection state when leaving a data source
      currentPage = 0;
      lastRenderedPage = 0;
      totalEntries = 0;
      totalPages = 0;
      pageEdges = null;
      currentDataSource = null;

      $('#save-rules').addClass('hidden');

      try {
        table.destroy();
      } catch (e) {
        // Fail silently
      }

      $('[data-order-date]').removeClass('asc').addClass('desc');

      getDataSources();
    }

    if (table && table.hasChanges()) {
      Fliplet.Modal.confirm({
        message: 'Are you sure? Changes that you made may not be saved.'
      }).then(function(result) {
        if (!result) {
          return;
        }

        resetAndGoBack();
      });
    } else {
      resetAndGoBack();
    }
  })
  .on('click', '[data-show-source]', function() {
    $('[data-show-source]').addClass('active-source');
    $('[data-show-trash-source]').removeClass('active-source');

    currentDataSourceId = 0;

    $activeDataSourceTable = $('#data-sources');
    $activeSortedColumn = $activeDataSourceTable.find('th.sorted');

    getDataSources();
  })
  .on('click', '[data-show-trash-source]', function() {
    $('[data-show-trash-source]').addClass('active-source');
    $('[data-show-source]').removeClass('active-source');

    currentDataSourceId = 0;
    $noResults.removeClass('show');
    $initialSpinnerLoading.addClass('animated');
    $contents.addClass('hidden');
    $activeDataSourceTable = $('#trash-sources');
    $activeSortedColumn = $activeDataSourceTable.children('thead .sorted');

    if (widgetData.context === 'app-overlay') {
      var request = {
        url: 'v1/data-sources/deleted/',
        method: 'GET'
      };

      if (!$btnShowAllSource.hasClass('hidden')) {
        request.data = { appId: widgetData.appId };
      }

      Fliplet.API.request(request).then(function(result) {
        if (!result.dataSources.length) {
          $noResults.removeClass('hidden');
          $noResults.addClass('show');
        }

        $('#data-sources').hide();
        $('#trash-sources').show();

        var orderedDataSources = sortDataSources('deletedAt', 'asc', result.dataSources);

        dataSourcesToSearch = orderedDataSources;
        trashedDataSources = _.sortBy(orderedDataSources, function(dataSource) {
          return dataSource.name.trim().toUpperCase();
        });

        renderTrashedDataSources(orderedDataSources);
        toggleSortedIcon($activeDataSourceTable.children('thead').find('.sorted'));
      });

      return;
    }

    isShowingAll = false;

    Fliplet.API.request('v1/data-sources/deleted/').then(function(result) {
      if (!result.dataSources.length) {
        $noDataSources.addClass('show');
      }

      $('#data-sources').hide();
      $('#trash-sources').show();

      var orderedDataSources = sortDataSources('deletedAt', 'desc', result.dataSources);

      dataSourcesToSearch = orderedDataSources;
      trashedDataSources = _.sortBy(orderedDataSources, function(dataSource) {
        return dataSource.name.trim().toUpperCase();
      });


      renderTrashedDataSources(orderedDataSources);
      toggleSortedIcon($activeDataSourceTable.children('thead').find('.sorted'));
    });
  })
  .on('click', '.sortable', function() {
    toggleSortedIcon($(this));
  })
  .on('click', '[data-save]', function(event) {
    event.preventDefault();

    // Wait for the current thread to apply changes to Handsontable
    return new Promise(function(resolve) {
      setTimeout(resolve, 0);
    }).then(function() {
      // Already saving, or a reload is needed first
      if (saveLock.isLocked()) {
        return SAVE_BUSY;
      }

      if (table && table.hasChanges()) {
        table.setChanges(false);

        return saveCurrentData();
      }
    }).then(function(result) {
      if (result === SAVE_BUSY || result === SAVE_SKIPPED) {
        return;
      }

      // Cancelled from the duplicate rows prompt: nothing was saved
      if (result === SAVE_CANCELLED) {
        table.setChanges(true);
        refreshSaveButton();

        return;
      }

      // Saved, and the notice already asks for a reload
      if (result === SAVED_NOT_REFRESHED) {
        $('#show-versions').show();

        return;
      }

      // Return to parent widget if in overlay
      if (widgetData.context === 'overlay') {
        Fliplet.Studio.emit('close-overlay');

        return;
      }

      $('#show-versions').show();

      if (table) {
        table.onSaveComplete();
      }
    }).catch(function(err) {
      onSaveFailed(err);
    });
  })
  .on('click', '[data-page-prev], [data-page-next]', function(event) {
    event.preventDefault();

    var isPrev = $(this).is('[data-page-prev]');

    navigateToPage(isPrev ? currentPage - 1 : currentPage + 1);
  })
  .on('change', '[data-page-jump]', function() {
    var inputPage = parseInt($(this).val(), 10);

    if (isNaN(inputPage) || inputPage < 1 || inputPage > totalPages) {
      $(this).val(currentPage + 1);

      return;
    }

    navigateToPage(inputPage - 1);
  })
  .on('keydown', '[data-page-jump]', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      $(this).trigger('change');
    }
  })
  .on('click', '[save-settings]', function() {
    $('form[data-settings]').submit();
  })
  .on('click', '[data-browse-source]', function(event) {
    event.preventDefault();
    currentDataSourceId = $(this).closest('.data-source').data('id');
    browseDataSource(currentDataSourceId);
  })
  .on('click', '[data-restore-source]', function(event) {
    event.preventDefault();
    currentDataSourceId = currentDataSourceId || $(this).closest('.data-source').data('id');

    var name = $(this).closest('.data-source').data('name');

    restoreDataSource(currentDataSourceId, name);
  })
  .on('click', '[data-remove-source]', function(event) {
    event.preventDefault();
    currentDataSourceId = currentDataSourceId || $(this).closest('.data-source').data('id');

    var name = $(this).closest('.data-source').data('name');

    deleteDataSource(currentDataSourceId, name);
  })
  .on('click', '[data-delete-source]', function(event) {
    event.preventDefault();

    // Deleting leaves the data source, which the save lock blocks (PS-2251)
    if (saveLock.isInFlight()) {
      return;
    }

    if (saveLock.needsReload()) {
      alertReloadFirst();

      return;
    }

    currentDataSourceId = currentDataSourceId || $(this).closest('.data-source').data('id');

    var usedAppsText = '';
    var currentDS = _.find(dataSources, function(ds) {
      return ds.id === currentDataSourceId;
    });

    if (currentDS && currentDS.apps && currentDS.apps.length) {
      var appPrefix = currentDS.apps.length > 1 ? 'projects: ' : 'project: ';
      var appUsedIn = currentDS.apps.map(function(elem) {
        return elem.name;
      });
      var appsList = _.map(appUsedIn, function(el) {
        return '<li><b>' + el + '</b></li>';
      });

      usedAppsText = 'The data source is currently in use by the following ' + appPrefix + '<br/><br/>' + '<ul>' + appsList.join('') + '</ul>' + '<br/>';
    }

    var message = 'Are you sure you want to delete this data source? ' + usedAppsText + 'All entries will be deleted.';

    deleteItem(message, currentDataSourceId);
  })
  .on('click', '[data-create-source]', function(event) {
    event.preventDefault();
    createDataSource();
  })
  .on('change', 'input[type="file"]', function() {
    var $input = $(this);
    var file = $input[0].files[0];
    var formData = new FormData();

    // An import reloads the grid, which must not happen mid-save
    if (saveLock.isInFlight()) {
      $input.val('');

      return;
    }

    // ...or add rows while a save that may still land is unconfirmed
    if (saveLock.needsReload()) {
      $input.val('');
      alertReloadFirst();

      return;
    }

    formData.append('file', file);

    currentDataSource.import(formData).then(function() {
      $input.val('');
      fetchCurrentDataSourceEntries();
    });
  })
  .on('click', '[data-create-role]', function(event) {
    event.preventDefault();

    var _this = $(this);
    var userId;
    var permissions;

    _this.addClass('disabled').text('Adding user...');

    setTimeout(function() {
      Fliplet.Modal.prompt({
        title: 'Enter the user ID'
      }).then(function(result) {
        if (result === null || !result.trim()) {
          _this.removeClass('disabled').text('Add new user');

          return;
        }

        userId = result;

        Fliplet.Modal.prompt({
          title: 'Set the permissions',
          value: 'crudq'
        }).then(function(result) {
          if (result === null || !result.trim()) {
            _this.removeClass('disabled').text('Add new user');

            return;
          }

          permissions = result;

          Fliplet.DataSources.connect(currentDataSourceId).then(function(source) {
            _this.removeClass('disabled').text('Add new user');

            return source.addUserRole({
              userId: userId,
              permissions: permissions
            });
          }).then(fetchCurrentDataSourceUsers, function(err) {
            _this.removeClass('disabled').text('Add new user');
            Fliplet.Modal.alert({ message: err.responseJSON.message });
          });
        });
      });
    }, 100);
  })
  .on('keyup keypress', '[data-input-name]', function(event) {
    var keyCode = event.keyCode || event.which;

    if (keyCode === 13) {
      event.preventDefault();

      return false;
    }
  })
  .on('click', '[data-revoke-role]', function(event) {
    event.preventDefault();

    var userId = $(this).data('revoke-role');

    Fliplet.Modal.confirm({
      message: 'Are you sure you want to revoke this role?'
    }).then(function(result) {
      if (!result) {
        return;
      }

      Fliplet.DataSources.connect(currentDataSourceId).then(function(source) {
        return source.removeUserRole(userId);
      }).then(function() {
        fetchCurrentDataSourceUsers();
      });
    });
  })
  .on('submit', 'form[data-settings]', function(event) {
    event.preventDefault();

    var name = $settings.find('#name').val().trim();

    if (!name) {
      $settings.find('#name').parents(':eq(1)').addClass('has-error');

      return;
    }

    var bundle = $('#bundle-online').is(':checked') ? false : true;
    var definition = definitionEditor.getValue();
    var hooks = hooksEditor.getValue();
    var accessRulesValue = accessRulesEditor.getValue();

    $settings.find('#name').parents(':eq(1)').removeClass('has-error');

    try {
      definition = JSON.parse(definition);
    } catch (e) {
      Fliplet.Navigate.popup({
        popupTitle: 'Invalid settings',
        popupMessage: 'Definition must be a valid JSON'
      });

      return;
    }

    try {
      hooks = JSON.parse(hooks);
    } catch (e) {
      Fliplet.Navigate.popup({
        popupTitle: 'Invalid settings',
        popupMessage: 'Hooks must be a valid JSON'
      });

      return;
    }

    if (!Array.isArray(hooks)) {
      Fliplet.Navigate.popup({
        popupTitle: 'Invalid hooks',
        popupMessage: 'Hooks must be an array'
      });

      return;
    }

    var trimmedAccessRules = (accessRulesValue || '').trim();
    var accessRulesData;

    if (trimmedAccessRules) {
      try {
        var parsedAccessRules = JSON.parse(accessRulesValue);
      } catch (e) {
        Fliplet.Navigate.popup({
          popupTitle: 'Invalid settings',
          popupMessage: 'Access rules must be a valid JSON'
        });

        return;
      }

      if (Array.isArray(parsedAccessRules)) {
        accessRulesData = parsedAccessRules;
      } else if (parsedAccessRules && typeof parsedAccessRules === 'object' && Array.isArray(parsedAccessRules.accessRules)) {
        accessRulesData = parsedAccessRules.accessRules;
      } else {
        Fliplet.Navigate.popup({
          popupTitle: 'Invalid access rules',
          popupMessage: 'Access rules JSON must be an array or an object containing an "accessRules" array.'
        });

        return;
      }
    } else {
      accessRulesData = [];
    }

    var formattedAccessRules = JSON.stringify(accessRulesData, null, 2);

    try {
      hooks.forEach(function(hook) {
        if (typeof hook.type !== 'string' || !hook.type) {
          throw new Error('One of your hooks have an invalid "type" (must be a string).');
        }

        if (!Array.isArray(hook.runOn)) {
          throw new Error('One of your hooks have an invalid "runOn" (must be an array).');
        }

        if (hook.payload && typeof hook.payload !== 'object') {
          throw new Error('One of your hooks have an invalid "payload" (must be an object)');
        }

        if (hook.triggers && !Array.isArray(hook.triggers)) {
          throw new Error('One of your hooks have an invalid "triggers" (must be an array).');
        }
      });
    } catch (e) {
      Fliplet.Navigate.popup({
        popupTitle: 'Invalid hooks',
        popupMessage: e
      });

      return;
    }

    Fliplet.DataSources.update({
      id: currentDataSourceId,
      name: name,
      bundle: bundle,
      definition: definition,
      hooks: hooks,
      accessRules: accessRulesData
    })
      .then(function() {
        currentDataSourceRules = JSON.parse(JSON.stringify(accessRulesData));
        currentFinalRules = JSON.parse(JSON.stringify(accessRulesData));
        accessRulesEditor.setValue(formattedAccessRules);
        // Update name on UI
        $('.editing-data-source-name').text(name);

        // Return to parent widget if in overlay
        if (widgetData.context === 'overlay') {
          Fliplet.Studio.emit('close-overlay');

          return;
        }

        // Go to entries
        $('[aria-controls="entries"]').click();
      });
  })
  .on('input', '.search', function() {
    // Escape search
    var s = this.value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    var term = new RegExp(s, 'i');

    $noDataSources.addClass('hidden');
    $noResults.removeClass('show');

    var search = dataSourcesToSearch.filter(function(dataSource) {
      return dataSource.name.match(term) || dataSource.id.toString().match(term);
    });

    $dataSources.html('');

    if (search.length === 0 && dataSources.length) {
      $noResults.addClass('show');
    }

    var html = [];

    if ($('[data-show-trash-source]').hasClass('active-source')) {
      search.forEach(function(dataSource) {
        html.push(getTrashSourceRender(dataSource));
      });

      $trashedDataSources.html(html.join(''));
    } else {
      search.forEach(function(dataSource) {
        html.push(getDataSourceRender(dataSource));
      });

      $dataSources.html(html.join(''));
    }
  })
  .on('click', '#get-backdoor', function(event) {
    event.preventDefault();

    $(this).addClass('disabled').text('Getting code...');

    Fliplet.API.request('v1/data-sources/' + currentDataSourceId + '/validation-code')
      .then(function(result) {
        if (result.code) {
          $settings.find('#backdoor').html(result.code);
          $settings.find('#backdoor-eg').html(result.code);
          $('.show-backdoor').addClass('hidden');
          $('.show-backdoor a').removeClass('disabled').text('Show bypass code');
          $('.hide-backdoor').addClass('show');
          $('.backdoor-code').addClass('show');
        }
      })
      .catch(function() {
        $('.show-backdoor a').removeClass('disabled').text('Show bypass code');
      });
  })
  .on('click', '#hide-backdoor', function(event) {
    event.preventDefault();
    $('.show-backdoor').removeClass('hidden');
    $('.hide-backdoor').removeClass('show');
    $('.backdoor-code').removeClass('show');
  })
  .on('focus', '.filter-form .form-control', function() {
    $('.filter-form').addClass('expanded');
    $('#search-field').attr('placeholder', 'Type to find...');
  })
  .on('blur', '.filter-form .form-control', function() {
    var value = $(this).val();

    if (value === '') {
      $('.filter-form').removeClass('expanded');
      $('.find-results').html('');
      $('#search-field').attr('placeholder', 'Find');
    }
  })
  .on('click', '.find-icon', function() {
    $('.filter-form .form-control').trigger('focus');
  })
  .on('click', '[data-back-to-versions]', function(e) {
    e.preventDefault();

    $versionContents.addClass('hidden').html('');
    $('#versions-details').removeClass('hidden');
  })
  .on('click', '[data-version-preview]', function(e) {
    e.preventDefault();

    var id = $(this).data('version-preview');
    var version = _.find(currentDataSourceVersions, { id: id });

    previewVersion(version);
  })
  .on('click', '[data-version-restore]', function(e) {
    e.preventDefault();

    // A restore replaces the rows the in-flight save is writing (PS-2251)
    if (saveLock.isInFlight()) {
      return;
    }

    // An unconfirmed save may still land on top of the restored version
    if (saveLock.needsReload()) {
      alertReloadFirst();

      return;
    }

    var id = $(this).data('version-restore');

    return Fliplet.Modal.confirm({
      message: 'Are you sure you want to restore this version on your Data Source? This will replace its entire contents.'
    }).then(function(result) {
      if (!result) {
        return;
      }

      $('#versions').addClass('hidden');
      $('#versions-details').removeClass('hidden');

      return Fliplet.API.request({
        url: 'v1/data-sources/' + currentDataSourceId + '/versions/' + id + '/restore',
        method: 'POST'
      }).then(function() {
        return fetchCurrentDataSourceEntries();
      }).then(function() {
        $('#show-entries').click();

        Fliplet.Modal.alert({
          title: 'Version restored',
          message: 'The version has been restored to your Data Source.'
        });
      });
    });
  })
  .on('click', '[data-version-copy]', function(e) {
    e.preventDefault();

    var id = $(this).data('version-copy');

    return createDataSource({
      version: {
        dataSourceId: currentDataSourceId,
        id: id
      }
    }, {
      name: 'Copy of ' + $sourceContents.find('.editing-data-source-name').text()
    });
  })
  .on('shown.bs.tab', function(e) {
    if ($(e.target).attr('aria-controls') !== 'entries') {
      // Discarding reloads the grid, which must not happen mid-save
      if (table && table.hasChanges() && !saveLock.isInFlight()) {
        Fliplet.Modal.confirm({
          message: 'Are you sure? Changes that you made may not be saved.'
        }).then(function(result) {
          // Continue editing data source entries
          if (!result) {
            $('[aria-controls="entries"]').click();

            return;
          }

          try {
            table.destroy();
            fetchCurrentDataSourceEntries();
          } catch (e) {
            // Fail silently
          }
        });
      }
    } else {
      if (hot.container !== null) {
        hot.render();
      }

      if (table) {
        if (table.hasChanges()) {
          table.onChange();
        } else {
          table.reset();
        }
      }

      // Keep the re-rendered grid and Save in line with the lock
      if (saveLock.isLocked()) {
        renderSaveLock();
      }

      $('.back-name-holder').removeClass('hide-date');
      $('.controls-wrapper').removeClass('data-settings data-roles');
    }

    if ($(e.target).attr('aria-controls') === 'settings') {
      $('.settings-btns').addClass('active');
      $('.save-btn').addClass('hidden');
      $('.back-name-holder').addClass('hide-date');
      $('.controls-wrapper').removeClass('data-roles').addClass('data-settings');
    } else {
      $('.settings-btns').removeClass('active');
    }

    if ($(e.target).attr('aria-controls') === 'roles') {
      $('.save-btn').addClass('hidden');
      $('.back-name-holder').addClass('hide-date');
      $('.controls-wrapper').removeClass('data-settings').addClass('data-roles');

      if (widgetData.context === 'overlay') {
        $('.save-btn').addClass('hidden');
        $('.back-name-holder').addClass('hide-date');
      }
    }
  });

$('#show-settings').click(function() {
  setTimeout(function() {
    definitionEditor.refresh();
    hooksEditor.refresh();
    accessRulesEditor.refresh();
  }, 0);
});

$('#add-custom-rule').click(function(event) {
  event.preventDefault();

  var $modal = $('#configure-rule');

  $modal.find('.modal-title').text('Add advanced custom security rule');
  $modal.find('[data-save-rule]').text('Add rule');

  configureAddRuleUI({ script: '' });
  showModal($modal);
});

$('#show-users').click(function() {
  fetchCurrentDataSourceUsers();
});

$('#show-versions').click(function() {
  fetchCurrentDataSourceVersions();
});

function findSecurityRule() {
  var rule = currentDataSourceRules.map(function(rule) {
    var tokens = _.get(rule, 'allow.tokens');

    if (!tokens || tokens.indexOf(widgetData.tokenId) === -1) {
      return;
    }
  });

  return rule;
}

function getSelectedTokenDetails() {
  var tokenSelectedName;
  var tokenSelectedId;

  var tokenDetails = _.find(integrationTokenList, function(integrationToken) {
    if (widgetData.tokenId) {
      if (integrationToken.id === widgetData.tokenId) {
        return integrationToken;
      }
    } else if (integrationToken.id === selectedTokenId) {
      return integrationToken;
    }
  });

  tokenSelectedName = tokenDetails.fullName;
  tokenSelectedId = tokenDetails.id;

  setSelectedTokenDetails(tokenSelectedId, tokenSelectedName);
}

function setSelectedTokenDetails(id, name) {
  $('#tokenSelectedId').text(id);
  $('#tokenSelectedName').text(name);
}

function getFilteredSpecificTokenList() {
  var rules = _.filter(currentDataSourceRules, function(currentRules) {
    return _.some(currentRules.allow && currentRules.allow.tokens, function(allowTokenId) {
      if (widgetData.tokenId && !selectedTokenId) {
        return allowTokenId === widgetData.tokenId;
      }

      return allowTokenId === selectedTokenId;
    });
  });

  filteredDataSources = rules;

  if (filteredDataSources.length === 0) {
    addSecurityRule();
  }

  $('#specific-token-filter').removeClass('hidden');
}

function addSecurityRule() {
  var rule = findSecurityRule();

  if (!rule || rule.length === 0) {
    $('#add-rule').click();
    rule = { type: [], allow: { tokens: [widgetData.tokenId] }, enabled: true };
    configureAddRuleUI(rule);
  } else {
    getSelectedTokenDetails();
    getFilteredSpecificTokenList();
  }
}

$('#add-rule').click(function(event) {
  event.preventDefault();

  var $modal = $('#configure-rule');

  $modal.find('.modal-title').text('Add new security rule');
  $modal.find('[data-save-rule]').text('Add rule');

  configureAddRuleUI();
  showModal($modal);
});

preconfiguredRules.forEach(function(rule, idx) {
  $('.preconfigured-rules').append('<li><a href="#" data-preconfigured="' + idx + '">' + rule.name + '</a></li>');
});

$('body').on('click', '[data-preconfigured]', function(event) {
  event.preventDefault();

  var idx = parseInt($(this).data('preconfigured'), 10);
  var rule = preconfiguredRules[idx];

  rule.rules.forEach(function(newRule) {
    currentDataSourceRules.push(newRule);
  });

  markDataSourceRulesUIWithChanges();

  setTimeout(function() {
    var $rule = $('#access-rules-list tbody tr:last-child');

    $rule.addClass('added');

    setTimeout(function() {
      $rule.removeClass('added');
      $rule.find('[data-rule-edit]').click();
    }, 500);
  }, 100);
});

$('input[name="exclude"]').on('tokenfield:createtoken', function(event) {
  var existingTokens = $(this).tokenfield('getTokens');

  $.each(existingTokens, function(index, token) {
    if (token.value === event.attrs.value) {
      event.preventDefault();
    }
  });
});

// Ensure rules filter again from currentFinalRules if selectedTokenId is changed from token-list dropdown
$('body').on('change', '.tokens-list', function() {
  selectedTokenId  = Number($('.tokens-list :selected').val());

  if (widgetData.tokenId && widgetData.tokenId !== selectedTokenId) {
    var rules = _.filter(currentFinalRules, function(currentRules) {
      return _.some(currentRules.allow && currentRules.allow.tokens, function(allowTokenId) {
        if (widgetData.tokenId && !selectedTokenId) {
          return allowTokenId === widgetData.tokenId;
        }

        return allowTokenId === selectedTokenId;
      });
    });

    filteredDataSources = rules;
  }
});

$('input[name="columns-list-mode"]').on('click', function() {
  columnsListMode = $(this).val();
  updateSaveRuleValidation();
});

$('body').on('click', '[data-remove-field]', function(event) {
  event.preventDefault();
  $(this).closest('.required-field').remove();
});

$('body').on('change', 'select[name="required-field-type"]', function(event) {
  event.preventDefault();

  var value = $(this).val();

  $(this).closest('.required-field').find('[name="value"]').toggleClass('hidden', value === 'required');
});

function configureAddRuleUI(rule) {
  rule = rule || {
    type: []
  };

  var isCustomRule = typeof rule.script === 'string';
  var selectedAppType = rule.appId ? 'filter' : 'all';
  var $apps = $('.apps-list');
  var $customRuleForm = $('[data-rule-custom]');

  if (isCustomRule) {
    $('[data-save-rule]').removeAttr('disabled');
    $('[data-rule-standard').addClass('hidden');

    $customRuleForm.removeClass('hidden');
    $customRuleForm.find('[name="name"]').val(rule.name || 'Untitled custom rule');
    customRuleEditor.setValue(rule.script || '');
  } else {
    $('[data-rule-custom').addClass('hidden');
    $('[data-rule-standard').removeClass('hidden');

    // Cleanup
    $appsBtnFilter.removeClass('selected');
    $apps.html('').hide();
    $('.required-fields').html('');
    $('.users-filter').addClass('hidden').find('.filters').html('');
    $('button.selected').removeClass('selected');
    $('input[name="type"]:checked').prop('checked', false);

    $('input[name="exclude"]').tokenfield('destroy');
    $('input[name="exclude"]').tokenfield({
      autocomplete: {
        source: _.compact(columns) || [],
        delay: 100
      },
      showAutocompleteOnFocus: true
    });

    var tokenField;

    if (rule.exclude) {
      tokenField = rule.exclude;
    } else if (rule.include) {
      tokenField = rule.include;
    } else {
      tokenField = [];
    }

    $('input[name="exclude"]').tokenfield('setTokens', tokenField);

    rule.type.forEach(function(type) {
      $('input[name="type"][value="' + type + '"]').prop('checked', true);
    });

    if (rule.allow) {
      if (typeof rule.allow === 'string') {
        $('[data-allow="' + rule.allow + '"]').click();
      } else if (typeof rule.allow === 'object' && rule.allow.tokens && rule.allow.tokens.length) {
        var selectedTokenId = _.first(rule.allow.tokens);

        if (selectedTokenId) {
          // Add token when not found in the list
          if (!_.find(integrationTokenList, { id: selectedTokenId })) {
            integrationTokenList.push({ id: selectedTokenId, fullName: 'API Token' });
          }
        }

        // Open UI and trigger "$allowBtnFilter" click handler
        $('[data-allow="tokens"]').click();

        if (selectedTokenId) {
          $(".tokens-list option[value='" + selectedTokenId + "']").attr('selected', 'selected');
        }
      } else {
        $('.filters').html('');
        $('[data-allow="filter"]').click();

        _.forIn(rule.allow.user, function(operation, column) {
          var $field = $('.filters .required-field').last();
          var operationType = Object.keys(operation)[0];
          var value = operation[operationType];

          $field.find('[name="column"]').val(column);
          $field.find('select').val(operationType);
          $field.find('[name="value"]').val(value);

          $('[data-add-user-filter]').click();
        });

        $('.filters .required-field').last().remove();
      }
    } else {
      $('[data-allow="all"]').click();
    }

    if (rule.require) {
      rule.require.forEach(function(field) {
        $('[data-add-filter]').click();

        var $field = $('.required-fields .required-field').last();

        if (typeof field === 'string') {
          $field.find('[name="field"]').val(field);
          $field.find('select').val('required');
        } else {
          var column = Object.keys(field)[0];
          var operation = field[column];
          var operationType = Object.keys(operation)[0];
          var value = operation[operationType];

          $field.find('[name="field"]').val(column);
          $field.find('select').val(operationType);
          $field.find('[name="value"]').val(value);
        }

        $field.find('select').trigger('change');
      });
    }

    // Setup
    updateSaveRuleValidation();

    $appsBtnFilter.filter('[data-apps="' + selectedAppType + '"]').click();

    getApps.then(function(apps) {
      var tpl = Fliplet.Widget.Templates['templates.checkbox'];

      apps.forEach(function(app) {
        var checkbox = tpl({
          id: app.id,
          name: app.name,
          checked: rule.appId && rule.appId.indexOf(app.id) !== -1 ? 'checked' : ''
        });

        $apps.append('<div class="app">' + checkbox + '</div>');
      });
    });
  }
}

function updateSaveRuleValidation() {
  var types = [];

  $typeCheckbox.filter(':checked').each(function() {
    types.push($(this).val());
  });

  if (types.length) {
    $('[data-save-rule]').removeAttr('disabled');
  } else {
    $('[data-save-rule]').attr('disabled', true);
  }

  function hasType(type) {
    return types.indexOf(type) !== -1;
  }

  var msg;

  if (columnsListMode === 'exclude') {
    if (hasType('select') && (hasType('insert') || hasType('update'))) {
      msg = 'Specify columns that should never be readable or writable by users when this rule is matched.';
    } else if (hasType('insert') || hasType('update')) {
      msg = 'Specify columns that should never be writable by users when this rule is matched.';
    } else {
      msg = 'Specify columns that should never be readable by users when this rule is matched.';
    }
  } else if (columnsListMode === 'include') {
    if (hasType('select') && (hasType('insert') || hasType('update'))) {
      msg = 'Only the columns specified here are readable and writable by users when this rule is matched';
    } else if (hasType('insert') || hasType('update')) {
      msg = 'Only the columns specified here are writable by users when this rule is matched';
    } else {
      msg = 'Only the columns specified here are readable by users when this rule is matched';
    }
  }

  $('[data-exclude-description]').text(msg);
}

/**
 * Render a list of columns from a security rule based on a property
 * @param {Object} rule - Security rule object
 * @param {String} prop - Security rule property for accessing the list of columns
 * @returns {String} HTML code for the column list
 **/
function columnListTemplate(rule, prop) {
  rule = rule || {};

  var columns = rule[prop];

  if (!Array.isArray(columns) || !columns.length) {
    return new Error('Columns not found for ' + prop);
  }

  if (columns.length === 1) {
    return '<code>' + columns[0] + '</code> only';
  }

  columns = _.clone(columns);

  var lastColumn = columns.pop();

  return columns.map(function(col) {
    return '<code>' + col + '</code>';
  }).join(', ') + ' and <code>' + lastColumn + '</code>';
}

$typeCheckbox.click(updateSaveRuleValidation);

$allowBtnFilter.click(function(event) {
  event.preventDefault();

  var $usersFilter = $('.users-filter');
  var $specificTokens = $('.tokens-list');
  var value = $(this).data('allow');

  $allowBtnFilter.removeClass('selected');
  $(this).addClass('selected');

  $usersFilter.toggleClass('hidden', value !== 'filter');
  $specificTokens.toggleClass('hidden', value !== 'tokens');

  if (value === 'tokens') {
    var tpl = Fliplet.Widget.Templates['templates.apiTokenList'];
    var appTokens = _.groupBy(integrationTokenList, function(token) {
      return _.get(_.first(token.apps), 'name', DESCRIPTION_APP_UNKNOWN);
    });

    // Sort by key (app name), but keep the unknown grouped tokens at the end of the list
    var appsList = _.sortBy(_.mapValues(appTokens, function(tokens, name) {
      return { name: name, tokens: tokens };
    }), function(app) {
      return app.name === DESCRIPTION_APP_UNKNOWN ? 'z' : app.name.toUpperCase();
    });

    $('.tokens-list').html(tpl({
      apps: appsList
    }));

    if (widgetData.tokenId) {
      $(".tokens-list option[value='" + widgetData.tokenId + "']").prop('selected', true);
    }
  }

  // Add first filter automatically
  if (value === 'filter' && !$usersFilter.find('.filters').html().trim()) {
    $('[data-add-user-filter]').click();
  }
});

$appsBtnFilter.click(function(event) {
  event.preventDefault();

  var $apps = $('.apps-list');

  $appsBtnFilter.removeClass('selected');
  $(this).addClass('selected');

  if ($(this).data('apps') === 'all') {
    $apps.hide();
  } else {
    $apps.show();
  }
});

$('[data-add-user-filter]').click(function(event) {
  event.preventDefault();

  var tpl = Fliplet.Widget.Templates['templates.userMatch'];

  $('.users-filter .filters').append(tpl());
  $('#configure-rule [data-toggle="tooltip"]').tooltip({
    hide: false,
    show: false,
    html: true,
    trigger: 'hover'
  });
});

$('[data-add-filter]').click(function(event) {
  event.preventDefault();

  var tpl = Fliplet.Widget.Templates['templates.requiredField'];

  $('.required-fields').append(tpl());
  $('#configure-rule [data-toggle="tooltip"]').tooltip({
    hide: false,
    show: false,
    html: true,
    trigger: 'hover'
  });
});

$('#show-access-rules').click(function() {
  var $tbody = $accessRulesList.find('tbody');

  $tbody.html('');
  $accessRulesList.css('opacity', 0.5);

  if (!currentDataSourceRules) {
    currentDataSourceRules = defaultAccessRules;
  }

  currentDataSourceRules.forEach(function(rule) {
    // Rules are enabled by default
    rule.enabled = rule.enabled === false ? false : true;
  });

  var isManagedDataSource = ['bookmarks', 'likes', 'comments'].indexOf(currentDataSourceType) !== -1;

  $('#add-rules-dropdown').toggleClass('hidden', isManagedDataSource);
  $('.managed-data-source-rules').toggleClass('hidden', !isManagedDataSource);
  $('.empty-data-source-rules').toggleClass('hidden', currentDataSourceRules.length > 0 || isManagedDataSource);
  $('#access-rules-list table').toggleClass('hidden', !currentDataSourceRules.length || isManagedDataSource);

  function operatorDescription(operation) {
    switch (operation) {
      case 'equals':
        return 'equals to';
      case 'notequals':
        return 'does not equals to';
      case 'contains':
        return 'contains';
      default:
        return operation;
    }
  }

  getApps.then(function(apps) {
    (selectedTokenId ? filteredDataSources : currentDataSourceRules).forEach(function(rule, index) {
      var tpl = Fliplet.Widget.Templates['templates.accessRule'];

      if (typeof rule.type === 'string') {
        rule.type = [rule.type];
      } else if (!rule.type) {
        rule.type = [];
      }

      $tbody.append(tpl({
        name: rule.name || ('Untitled rule ' + (index + 1)),
        index: index,
        enabled: rule.enabled,
        hasScript: typeof rule.script === 'string',
        type: rule.type.map(function(type) {
          var description;

          switch (type) {
            case 'select':
              description = 'Read';
              break;
            case 'insert':
              description = 'Write';
              break;
            case 'update':
              description = 'Update';
              break;
            case 'delete':
              description = 'Delete';
              break;
            default:
              break;
          }

          return description;
        }).join(', '),
        allow: (function() {
          if (rule.allow && typeof rule.allow === 'object') {
            if (rule.allow.tokens) {
              var token = _.find(integrationTokenList, function(integrationToken) {
                return _.some(rule.allow.tokens, function(token) {
                  return integrationToken.id === token;
                });
              });

              if (!token && rule.allow.tokens && rule.allow.tokens.length) {
                token = { id: _.first(rule.allow.tokens), fullName: 'API Token' };
              }

              return 'Specific token: ID#' + token.id + ' - ' + token.fullName;
            } else if (rule.allow.user) {
              return 'Specific users<br />' + _.map(Object.keys(rule.allow.user), function(key) {
                var operation = rule.allow.user[key];
                var operationType = Object.keys(operation)[0];
                var operator = operatorDescription(operationType);

                return '<code>' + key + ' ' + operator + ' ' + operation[operationType] + '</code>';
              }).join('<br />');
            }

            return;
          }

          switch (rule.allow) {
            case 'loggedIn':
              return 'Logged in users';
            default:
              return 'All users';
          }
        })(),
        include: (function() {
          if (rule.include) {
            return 'Include ' + columnListTemplate(rule, 'include');
          } else if (rule.exclude) {
            return 'Exclude ' + columnListTemplate(rule, 'exclude');
          }

          return '-';
        })(),
        apps: rule.appId
          ? _.compact(rule.appId.map(function(appId) {
            var app = _.find(apps, {
              id: appId
            });

            return app && app.name;
          })).join(', ')
          : 'All projects',
        require: rule.require
          ? rule.require.map(function(require) {
            if (typeof require === 'string') {
              return '<code>' + require + ' is required</code>';
            }

            var field = Object.keys(require)[0];

            var operationType = Object.keys(require[field])[0];
            var operator = operatorDescription(operationType);

            return '<code>' + field + ' ' + operator + ' ' + require[field][operationType] + '</code>';
          }).join('<br />')
          : '—'
      }));
    });

    $tbody.sortable({
      tolerance: 'pointer',
      cursor: '-webkit-grabbing; -moz-grabbing;',
      axis: 'y',
      forcePlaceholderSize: true,
      forceHelperSize: true,
      revert: 150,
      helper: function(event, row) {
        // Set width to each td of dragged row
        row.children().each(function() {
          $(this).width($(this).width());
        });

        return row;
      },
      start: function(event, tbodySortObject) {
        var $originalTbodyObject = tbodySortObject.helper.children();

        // Set width of each td of row before dragging so the table width remains the same
        tbodySortObject.placeholder.children().each(function(index) {
          $(this).width($originalTbodyObject.eq(index).width());
        });
      },
      update: function() {
        var result = $(this).sortable('toArray', { attribute: 'data-rule-index' });

        currentDataSourceRules = _.map(result, function(r) {
          return currentDataSourceRules[r];
        });

        markDataSourceRulesUIWithChanges();
      }
    });

    $accessRulesList.css('opacity', 1);
  });
});

/**
 * Check whether security rule is found or not in current rules
 * @returns {Boolean} Returns true if security rule found
 */
function getSecurityRule() {
  var hasSecurityRule = false;

  if (currentFinalRules === null) {
    currentFinalRules = [];
  }

  if (currentFinalRules.length > 0) {
    hasSecurityRule = currentFinalRules.some(function(rule) {
      return _.some(rule.allow && rule.allow.tokens, function(token) {
        return token && (token === widgetData.tokenId || token === selectedTokenId);
      });
    });
  }

  return hasSecurityRule;
}

$('[data-clear-filter]').click(function(event) {
  event.preventDefault();

  selectedTokenId = '';
  $('#specific-token-filter').removeClass('hidden');
  $('#save-rules').addClass('hidden');

  $('#specific-token-filter').addClass('hidden');
  $('#show-access-rules').click();
  $('#save-rules').removeClass('hidden');
});

$('[data-save-rule]').click(function(event) {
  event.preventDefault();

  var rule;
  var error;

  var isCustomRule = $('[data-rule-standard]').hasClass('hidden');

  if (isCustomRule) {
    rule = {
      name: $('[data-rule-custom] [name="name"]').val(),
      script: customRuleEditor.getValue()
    };

    customRuleEditor.setValue('');
  } else {
    rule = { type: [] };

    $typeCheckbox.filter(':checked').each(function() {
      rule.type.push($(this).val());
    });

    var $allow = $('.selected[data-allow]');

    $('#specific-token-filter').addClass('hidden');

    if ($allow.data('allow') === 'filter') {
      var user = {};

      $('.users-filter .required-field').each(function() {
        var column = $.trim($(this).find('[name="column"]').val());
        var value = $.trim($(this).find('[name="value"]').val());
        var operationType = $(this).find('select').val();

        if (column && value) {
          try {
            Handlebars.compile(value)();
          } catch (err) {
            error = 'The value for the field "' + column + '" is not a valid Handlebars expression.';
          }

          var query = {};

          query[operationType] = value;
          user[column] = query;
        }
      });

      rule.allow = { user: user };
    } else if ($allow.data('allow') === 'tokens') {
      selectedTokenId  = Number($('.tokens-list :selected').val());

      var tokenFullName = _.find(integrationTokenList, function(token) {
        return token.id === selectedTokenId;
      });

      if (tokenFullName) {
        selectedTokenName = tokenFullName.fullName;
      }

      setSelectedTokenDetails(selectedTokenId, selectedTokenName);
      rule.allow = { 'tokens': [selectedTokenId] };
      $('#specific-token-filter').removeClass('hidden');
    } else {
      rule.allow = $allow.data('allow');
    }

    var $apps = $('.selected[data-apps]');

    if ($apps.data('apps') === 'filter') {
      var appId = [];

      $('.apps-list .app input[type="checkbox"]:checked').each(function() {
        appId.push(parseInt($(this).val(), 10));
      });

      if (appId.length) {
        rule.appId = appId;
      }
    }

    var requiredFields = [];

    $('.required-fields .required-field').each(function() {
      var column = $.trim($(this).find('[name="field"]').val());
      var value = $.trim($(this).find('[name="value"]').val());
      var operationType = $(this).find('select').val();

      if (!column) {
        return;
      }

      // Ensure multiple fields for the same column name are skipped
      if (_.find(requiredFields, function(field) {
        if (typeof field === 'string') {
          return field === column;
        }

        return Object.keys(field)[0] === column;
      })) {
        return;
      }

      if (operationType === 'required') {
        return requiredFields.push(column);
      }

      try {
        Handlebars.compile(value)();
      } catch (err) {
        error = 'The value for the required field "' + column + '" is not a valid Handlebars expression.';
      }

      var field = {};
      var query = {};

      query[operationType] = value;
      field[column] = query;

      requiredFields.push(field);
    });

    if (requiredFields.length) {
      rule.require = requiredFields;
    }

    var exclude = _.compact($('input[name="exclude"]').val().split(',').map(column => column.trim()));

    if (columnsListMode === 'exclude') {
      if (exclude.length) {
        rule.exclude = exclude;
      }
    } else if (exclude.length) {
      rule.include = exclude;
    }
  }

  if (error) {
    return Fliplet.Modal.alert({ message: error });
  }

  $('[data-dismiss="modal"]').click();

  var isAddingRule = $('#configure-rule').find('.modal-title').text().indexOf('Add ') === 0;

  if (currentDataSourceRuleIndex === undefined) {
    currentDataSourceRules.push(rule);
  } else {
    currentDataSourceRules[currentDataSourceRuleIndex] = rule;

    // For Edit security rule to retain new changes in final rule
    if (!isAddingRule || widgetData.context === 'overlay') {
      currentFinalRules[currentDataSourceRuleIndex] = rule;
    }

    currentDataSourceRuleIndex = undefined;
  }

  if (rule.allow && rule.allow.tokens) {
    getFilteredSpecificTokenList();
  }

  markDataSourceRulesUIWithChanges();
});

$('body').on('click', '#save-rules', function(event) {
  event.preventDefault();
  updateDataSourceRules();
});

$('body').on('click', '[data-rule-delete]', function(event) {
  event.preventDefault();

  $('#specific-token-filter').addClass('hidden');

  var index = parseInt($(this).closest('tr').data('rule-index'), 10);

  if (selectedTokenId) {
    var deletedItem = filteredDataSources[index];

    filteredDataSources.splice(index, 1);
    currentDataSourceRules = currentDataSourceRules.filter(function(dataSourceRule) {
      return !_.isEqual(dataSourceRule, deletedItem);
    });
  } else {
    currentDataSourceRules.splice(index, 1);
  }

  selectedTokenId = '';
  markDataSourceRulesUIWithChanges();
});

$('body').on('click', '[data-toggle-status]', function(event) {
  event.preventDefault();

  var index = parseInt($(this).closest('tr').data('rule-index'), 10);
  var rule = currentDataSourceRules[index];

  rule.enabled = !rule.enabled;

  // Briefly show a UI feedback as the rule enables/disables
  $(this).find('i')
    .addClass('fa-spinner fa-pulse')
    .removeClass('fa-toggle-on fa-toggle-off');

  markDataSourceRulesUIWithChanges();
});

$('body').on('click', '[data-rule-edit]', function(event) {
  event.preventDefault();

  currentDataSourceRuleIndex = parseInt($(this).closest('tr').data('rule-index'), 10);

  var rule = currentDataSourceRules[currentDataSourceRuleIndex];
  var $modal = $('#configure-rule');

  if (rule.exclude) {
    columnsListMode = 'exclude';
  } else {
    columnsListMode = 'include';
  }

  $('#' + columnsListMode).prop('checked', true);

  $modal.find('.modal-title').text('Edit security rule');
  $modal.find('[data-save-rule]').text('Confirm');

  configureAddRuleUI(rule);
  showModal($modal);
});

function showModal($modal) {
  $modal.on('shown.bs.modal', function() {
    customRuleEditor.refresh();
  });

  $modal.modal();
}

function markDataSourceRulesUIWithChanges() {
  $('#save-rules').removeClass('hidden');

  // Refresh UI
  $('#show-access-rules').click();
}

function updateDataSourceRules() {
  var $saveButton = $('#save-rules');
  var buttonLabel = $saveButton.html();

  $saveButton.html('Saving...').addClass('disabled');

  return Fliplet.DataSources.update(currentDataSourceId, {
    accessRules: currentDataSourceRules
  }).then(function() {
    var formattedRules = JSON.stringify(Array.isArray(currentDataSourceRules) ? currentDataSourceRules : [], null, 2);

    currentFinalRules = JSON.parse(JSON.stringify(currentDataSourceRules));
    accessRulesEditor.setValue(formattedRules);
    $saveButton.html(buttonLabel).removeClass('disabled').addClass('hidden');

    Fliplet.Modal.alert({
      message: 'Your changes have been applied to all affected projects.'
    });
  }).catch(function(error) {
    $saveButton.html(buttonLabel).removeClass('disabled');

    Fliplet.Modal.alert({
      title: 'Cannot update security rules',
      message: Fliplet.parseError(error)
    });
  });
}

Fliplet().then(function() {
  if (widgetData.context === 'overlay') {
    // Enter data source when the provider starts if ID exists
    $('.save-btn, .data-save-status').addClass('hidden');
    browseDataSource(widgetData.dataSourceId);
  } else {
    getDataSources();
  }
});

$('[data-cancel]').click(function(event) {
  event.preventDefault();

  $('[data-dismiss="modal"]').click();
});
