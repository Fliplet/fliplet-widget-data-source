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
        $('[data-back]').text('See all my app\'s data sources');
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

function waitUntilSized(selector, callback) {
  const el = document.querySelector(selector);

  function check() {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      callback();
    } else {
      requestAnimationFrame(check);
    }
  }

  check();
}

function renderSpreadsheet(rowsData) {
  waitUntilSized('.table-entries', () => {
    table = spreadsheet({ columns: columns, rows: rowsData });
    $('.table-entries').css('visibility', 'visible');
    $('#versions').removeClass('hidden');
  });
}

function fetchCurrentDataSourceDetails() {
  definitionEditor.setValue('');
  hooksEditor.setValue('');

  return Fliplet.DataSources.getById(currentDataSourceId, { cache: false }).then(function(dataSource) {
    $settings.find('#id').html(dataSource.id);
    $settings.find('[name="name"]').val(dataSource.name);

    if (!dataSource.bundle) {
      $('#bundle').prop('checked', true);
    }

    currentDataSourceType = dataSource.type;
    currentDataSourceRules = dataSource.accessRules;
    currentFinalRules = dataSource.accessRules;
    currentDataSourceDefinition = dataSource.definition || {};

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
 * @returns {undefined}
 */
function cacheOriginalEntries(entries, clientIdMap) {
  entryMap.original = {};

  _.forEach(entries, function(entry) {
    if (!entry.id && typeof clientIdMap === 'object') {
      entry.id = clientIdMap[entry.clientId];
    }

    entryMap.original[entry.id] = _.pick(entry, ['id', 'data', 'order']);
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

function fetchCurrentDataSourceEntries(entries) {
  return Fliplet.DataSources.connect(currentDataSourceId).then(function(source) {
    clearLiveDataTimer();

    currentDataSource = source;

    return Fliplet.DataSources.getById(currentDataSourceId, { cache: false }).then(function(dataSource) {
      var sourceName = dataSource.name;

      currentDataSourceUpdatedAt = TD(new Date(), { format: 'lll', locale: locale });

      $sourceContents.find('.editing-data-source-name').text(sourceName);

      columns = dataSource.columns || [];

      if (entries) {
        return Promise.resolve(entries);
      }

      return source.find({}).catch(function() {
        return Promise.reject('Access denied. Please review your security settings if you want to access this data source.');
      });
    });
  }).then(function(rows) {
    if (dataSourceIsLive) {
      startLiveDataTimer();
    }

    // Cache entries in a new thread
    setTimeout(function() {
      cacheOriginalEntries(rows);
    }, 0);

    $('#show-versions').show();

    if ((!rows || !rows.length) && (!columns || !columns.length)) {
      rows = [{
        data: {
          'Column 1': 'demo data',
          'Column 2': 'demo data'
        }
      }, {
        data: {
          'Column 1': 'demo data',
          'Column 2': 'demo data'
        }
      }];
      columns = ['Column 1', 'Column 2'];
    } else {
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

    currentDataSourceRowsCount = rows.length;
    currentDataSourceColumnsCount = columns.length;

    // On initial load, create an empty spreadsheet as this speeds up subsequent loads
    if (initialLoad) {
      $('.table-entries').css('visibility', 'hidden');
      table = spreadsheet({ columns: columns, rows: [], initialLoad: true });


      requestAnimationFrame(() => {
        table.destroy();
        initialLoad = false;
        renderSpreadsheet(rows);
      });
    } else {
      renderSpreadsheet(rows);
    }
  })
    .catch(function onFetchError(error) {
      var message = error;

      if (error instanceof Error) {
        message = 'Error loading data source.';

        if (typeof Raven !== 'undefined') {
          Raven.captureException(error, { extra: { dataSourceId: currentDataSourceId } });
        }
      } else if (typeof Raven !== 'undefined') {
        Raven.captureMessage('Error accessing data source', { extra: { dataSourceId: currentDataSourceId, error: error } });
      }

      $('.entries-message').html('<br>' + message);
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
  saveCurrentData().then(Fliplet.Widget.complete);
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
function getCommitPayload(entries) {
  entries = entries || [];

  var inserted = [];
  var updated = [];
  var deleted = [];

  // Track entries that weren't new
  entryMap.entries = {};

  entries.forEach(function(entry) {
    // Add new entries to inserted array
    if (typeof entry.id === 'undefined') {
      entry.clientId = Fliplet.guid();
      inserted.push(entry);

      return;
    }

    // Add a recovered entry as a new entry
    if (!entryMap.original[entry.id]) {
      delete entry.id;
      entry.clientId = Fliplet.guid();
      inserted.push(entry);

      return;
    }

    entryMap.entries[entry.id] = entry;
  });

  _.forIn(entryMap.original, function(original) {
    var entry = entryMap.entries[original.id];

    if (!entry) {
      deleted.push(original.id);

      return;
    }

    if (_.isEqual(entry, original)) {
      return;
    }

    updated.push(entry);
  });

  return {
    entries: updated.concat(inserted),
    delete: deleted
  };
}

function saveCurrentData() {
  var columns;

  table.onSave();

  var entries = table.getData({
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

  // Get the empty columns from assessing all entries
  var emptyColumns = getEmptyColumns(columns, entries);

  // Remove empty columns from the table
  _.forEach(emptyColumns, function(column) {
    var columnIndex = columns.indexOf(column);

    if (columnIndex !== -1) {
      hot.alter('remove_col', columnIndex, 1, 'removeEmptyColumn');
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

  return currentDataSource.commit({
    entries: payload.entries,
    delete: payload.delete,
    columns: columns,
    returnEntries: false
  }).then(function(response) {
    var clientIds = [];
    var ids = [];

    // Generate an object mapping client IDs to new entry IDs
    _.forEach(response.clientIds, function(entry) {
      clientIds.push(entry.clientId);
      ids.push(entry.id);
    });

    var clientIdMap = _.zipObject(clientIds, ids);

    cacheOriginalEntries(entries, clientIdMap);
    table.setData({ columns: columns, rows: entries });
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

    Fliplet.Organizations.get().then(function(organizations) {
      if (widgetData.appId) {
        _.extend(createOptions, {
          appId: widgetData.appId,
          name: dataSourceName
        });
      } else {
        _.extend(createOptions, {
          organizationId: organizations[0].id,
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

    $('.save-btn').addClass('hidden');

    fetchCurrentDataSourceEntries();

    Fliplet.Studio.emit('track-event', {
      category: 'dsm_reload_warning',
      action: 'reload'
    });
  })
  .on('click', '[data-back]', function(event) {
    event.preventDefault();

    $('[href="#entries"]').click();

    if (table.hasChanges()) {
      Fliplet.Modal.confirm({
        message: 'Are you sure? Changes that you made may not be saved.'
      }).then(function(result) {
        if (!result) {
          return;
        }

        $('#save-rules').addClass('hidden');

        try {
          table.destroy();
        } catch (e) {
          // Fail silently
        }

        $('[data-order-date]').removeClass('asc').addClass('desc');

        getDataSources();
      });
    } else {
      $('#save-rules').addClass('hidden');

      try {
        table.destroy();
      } catch (e) {
        // Fail silently
      }

      $('[data-order-date]').removeClass('asc').addClass('desc');

      getDataSources();
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
      if (table.hasChanges()) {
        table.setChanges(false);

        return saveCurrentData();
      }
    }).then(function() {
      // Return to parent widget if in overlay
      if (widgetData.context === 'overlay') {
        Fliplet.Studio.emit('close-overlay');

        return;
      }

      $('#show-versions').show();
      table.onSaveComplete();
    }).catch(function(err) {
      if (Fliplet.Error.isHandled(err)) {
        return;
      }

      Fliplet.Modal.alert({
        title: 'Error saving data source',
        message: Fliplet.parseError(err)
      });

      table.setChanges(true);
      table.onSaveError();
    });
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
    currentDataSourceId = currentDataSourceId || $(this).closest('.data-source').data('id');

    var usedAppsText = '';
    var currentDS = _.find(dataSources, function(ds) {
      return ds.id === currentDataSourceId;
    });

    if (currentDS && currentDS.apps && currentDS.apps.length) {
      var appPrefix = currentDS.apps.length > 1 ? 'apps: ' : 'app: ';
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

    var bundle = !$('#bundle').is(':checked');
    var definition = definitionEditor.getValue();
    var hooks = hooksEditor.getValue();

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
      hooks: hooks
    })
      .then(function() {
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
      if (table.hasChanges()) {
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

      if (table.hasChanges()) {
        table.onChange();
      } else {
        table.reset();
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
        apps: rule.appId ?
          _.compact(rule.appId.map(function(appId) {
            var app = _.find(apps, {
              id: appId
            });

            return app && app.name;
          })).join(', ')
          : 'All apps',
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

    // For Edit security rule adding the rule in current final rules
    if (!isAddingRule || (widgetData.context === 'overlay' && widgetData.tokenId !== selectedTokenId)) {
      currentFinalRules.push(rule);
    }
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
    $saveButton.html(buttonLabel).removeClass('disabled').addClass('hidden');

    Fliplet.Modal.alert({
      message: 'Your changes have been applied to all affected apps.'
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
