var $initialSpinnerLoading = $('.spinner-holder.inital-state');
var $contents = $('#contents');
var $sourceContents = $('#source-contents');
var $dataSources = $('#data-sources > tbody');
var $usersContents = $('#users');
var $tableContents;
var $settings = $('form[data-settings]');
var $noResults = $('.no-results-found');

var organizationId = Fliplet.Env.get('organizationId');
var currentDataSource;
var currentDataSourceId;
var currentDataSourceDefinition;
var currentEditor;
var dataSources;
var allDataSources;
var table;
var dataSourceEntriesHasChanged = false;
var isShowingAll = false;

var widgetId = parseInt(Fliplet.Widget.getDefaultId(), 10);
var data = Fliplet.Widget.getData(widgetId) || {};
var copyData = data;

var hooksEditor = CodeMirror.fromTextArea($('#hooks')[0], {
  lineNumbers: true,
  mode: 'javascript'
});

var definitionEditor = CodeMirror.fromTextArea($('#definition')[0], {
  lineNumbers: true,
  mode: 'javascript'
});

// Fetch all data sources
function getDataSources() {
  $initialSpinnerLoading.addClass('animated');
  $contents.addClass('hidden');
  $sourceContents.addClass('hidden');
  $('[data-save]').addClass('hidden');
  $('.search').val(''); // Reset search
  $('#search-field').val(''); // Reset filter

  // COMMENTED BECASUE WE SHOULD ALWAYS UPDATE THE LIST OF DATA SOURCES
  // If we already have data sources no need to go further.
  /*if (dataSources) {
    $initialSpinnerLoading.removeClass('animated');
    $contents.removeClass('hidden');
    return;
  }*/

  return Fliplet.DataSources.get({
    roles: 'publisher,editor',
    type: null
  }, {
    cache: false
  })
    .then(function(userDataSources) {
      allDataSources = userDataSources;

      if (copyData.context === 'app-overlay' || copyData.appId) {
        // Changes UI text
        $('[data-show-all-source]').removeClass('hidden');
        $('[data-back]').text('See all my app\'s data sources');

        // Filters data sources
        var filteredDataSources = [];
        userDataSources.forEach(function(dataSource, index) {
          var matchedApp = _.find(dataSource.apps, function(app) {
            return dataSource.appId === copyData.appId || app.id === copyData.appId;
          });

          if (matchedApp) {
            filteredDataSources.push(userDataSources[index]);
          }
        });
        dataSources = filteredDataSources;
      } else {
        dataSources = userDataSources;
      }

      // Order data sources by updatedAt
      var orderedDataSources = sortDataSources('updatedAt', 'desc');

      // Start rendering process
      renderDataSources(orderedDataSources);
    })
    .catch(function (error) {
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

  dataSources.forEach(function (dataSource) {
    html.push(getDataSourceRender(dataSource));
  });

  $dataSources.html(html.join(''));
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
  }).then(function (dismiss) {
    if (dismiss) {
      return;
    }

    Fliplet.Modal.alert({
      message: parsedError
    });
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

    currentDataSourceDefinition = dataSource.definition || {};

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

function fetchCurrentDataSourceEntries(entries) {
  var columns;

  return Fliplet.DataSources.connect(currentDataSourceId).then(function(source) {
      currentDataSource = source;

      return Fliplet.DataSources.getById(currentDataSourceId, { cache: false }).then(function(dataSource) {
        var sourceName = dataSource.name;

        $sourceContents.find('.editing-data-source-name').html(sourceName);
        $sourceContents.find('.data-save-updated').html('All changes saved!');

        columns = dataSource.columns || [];

        if (entries) {
          return Promise.resolve(entries);
        }

        return source.find({}).catch(function() {
          return Promise.reject('Access denied. Please review your security settings if you want to access this data source.');
        });
      });
    }).then(function(rows) {
      if ((!rows || !rows.length) && (!columns || !columns.length)) {
        rows = [{
          data: {
            "Column 1": 'demo data',
            "Column 2": 'demo data',
          }
        }, {
          data: {
            "Column 1": 'demo data',
            "Column 2": 'demo data',
          }
        }];
        columns = ['Column 1', 'Column 2'];
      } else {
        // Let's make sure we get all the columns checking all rows
        // and add any missing column to the datasource columns
        rows.forEach(function addMissingColumns(row) {
          Object.keys(row.data).forEach(function addColumn(column) {
            if (columns.indexOf(column) > -1) {
              return;
            }

            columns.push(column);
          });
        });
      }

      table = spreadsheet({ columns: columns, rows: rows });
      $('.table-entries').css('visibility', 'visible');
    })
    .catch(function onFetchError(error) {
      var message = error;
      if (error instanceof Error) {
        var message = 'Error loading data source.';
        if (typeof Raven !== 'undefined') {
          Raven.captureException(error, { extra: { dataSourceId: currentDataSourceId } });
        }
      } else {
        if (typeof Raven !== 'undefined') {
          Raven.captureMessage('Error accessing data source', { extra: { dataSourceId: currentDataSourceId, error: error } });
        }
      }
      $('.entries-message').html('<br>' + message);
    });
}

Fliplet.Widget.onSaveRequest(function() {
  saveCurrentData().then(Fliplet.Widget.complete);
});

function saveCurrentData() {
  var columns;
  $('[data-save]').addClass('hidden');
  $('.data-save-updated').removeClass('hidden').html('Saving...');
  $('.name-wrapper').addClass('saved');
  var entries = table.getData();
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
    columns = table.getColumns();
  }

  var widths = table.getColWidths();

  // Update column sizes in background
  Fliplet.DataSources.getById(currentDataSourceId).then(function (dataSource) {
    dataSource.definition = dataSource.definition || {};
    dataSource.definition.columnsWidths = widths;

    return Fliplet.DataSources.update(currentDataSourceId, { definition: dataSource.definition });
  }).catch(console.error);

  return currentDataSource.commit(entries, columns);
}

// Append a data source to the DOM
function getDataSourceRender(data) {
  var tpl = Fliplet.Widget.Templates['templates.dataSource'];
  var html = '';
  if (Array.isArray(data.apps)) {
    data.apps = _.uniqBy(data.apps, function (app) {
      return app.id;
    });
  }
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
  $initialSpinnerLoading.addClass('animated');
  $('.settings-btns').removeClass('active');
  $('.entries-message').html('<br>Loading data...');

  // Input file temporarily disabled
  // $contents.append('<form>Import data: <input type="file" /></form><hr /><div id="entries"></div>');

  Promise.all([
      fetchCurrentDataSourceEntries(),
      fetchCurrentDataSourceUsers(),
      fetchCurrentDataSourceDetails()
    ])
    .then(function() {
      $sourceContents.removeClass('hidden');
      $initialSpinnerLoading.removeClass('animated');
      $('[href="#entries"]').click();
      windowResized();

      if (copyData.context === 'overlay') {
        Fliplet.DataSources.get({
            roles: 'publisher,editor',
            type: null
          }, {
            cache: false
          })
          .then(function(updatedDataSources) {
            var html = [];
            dataSources = updatedDataSources;
            dataSources.forEach(function (dataSource) {
              html.push(getDataSourceRender(dataSource));
            });
            $dataSources.html(html.join(''));
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

function createDataSource() {
  Fliplet.Modal.prompt({
  title: 'New data source',
  message: 'Enter a data source name',
  }).then(function (result) {
    if (result === null) {
      return;
    }
    var dataSourceName = result.trim();
    if (!dataSourceName) {
      Fliplet.Modal.alert({
        message: 'You must enter a data source name'
      }).then(function () {
        createDataSource();
        return;
      });
    }

    Fliplet.Organizations.get().then(function(organizations) {
      return Fliplet.DataSources.create({
        organizationId: organizations[0].id,
        name: dataSourceName
      });
    }).then(function(createdDataSource) {
      dataSources.push(createdDataSource);
      $dataSources.append(getDataSourceRender(createdDataSource));
      browseDataSource(createdDataSource.id);
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

function sortDataSources(key, order) {
  var toBeOrderedDataSources = dataSources;

  if ((copyData.context === 'app-overlay' || copyData.appId) && isShowingAll) {
    toBeOrderedDataSources = allDataSources;
  }

  // Order by updatedAt
  var orderedDataSources = _.orderBy(toBeOrderedDataSources, function(ds) {
    var date = new Date(ds[key]);
    if (Object.prototype.toString.call(date) === "[object Date]" && !isNaN(date)) {
      return new Date(ds[key]).getTime();
    }

    var tempData = ds[key].toString().toUpperCase();
    tempData = tempData.match(/[A-Za-z]/)
      ? tempData
      : '{' + tempData;
    return tempData;
  }, [order]);

  return orderedDataSources;
}

Handlebars.registerHelper('momentCalendar', function(date) {
  return moment(date).calendar(null, {
    sameDay: '[Today at] h:mm A',
    nextDay: '[Tomorrow at ] h:mm A',
    nextWeek: 'dddd [at] h:mm A',
    lastDay: '[Yesterday at] h:mm A',
    lastWeek: '[Last] dddd [at] h:mm A',
    sameElse: 'MMMM Do YYYY'
  });
});

// Events

// Prevent Cmd + F default behaviour and use our find
window.addEventListener('keydown', function (event) {
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
window.addEventListener('message', function(event){
  if (event.data && event.data.type === 'browser-find') {
    activateFind();
  }
}, false);

$(window).on('resize', windowResized).trigger('resize');
$('#app')
  .on('click', '[data-order-date]', function() {
    if ($(this).hasClass('desc')) {
      $(this).removeClass('desc').addClass('asc');
      // Order data sources by updatedAt
      var orderedDataSources = sortDataSources('updatedAt', 'asc');
      // Start rendering process
      renderDataSources(orderedDataSources);
      return;
    }

    if ($(this).hasClass('asc')) {
      $(this).removeClass('asc').addClass('desc');
      // Order data sources by updatedAt
      var orderedDataSources = sortDataSources('updatedAt', 'desc');
      // Start rendering process
      renderDataSources(orderedDataSources);
      return;
    }
  })
  .on('click', '[data-order-name]', function() {
    if ($(this).hasClass('desc')) {
      $(this).removeClass('desc').addClass('asc');
      // Order data sources by updatedAt
      var orderedDataSources = sortDataSources('name', 'asc');
      // Start rendering process
      renderDataSources(orderedDataSources);
      return;
    }

    if ($(this).hasClass('asc')) {
      $(this).removeClass('asc').addClass('desc');
      // Order data sources by updatedAt
      var orderedDataSources = sortDataSources('name', 'desc');
      // Start rendering process
      renderDataSources(orderedDataSources);
      return;
    }
  })
  .on('click', '[data-show-all-source]', function() {
    isShowingAll = true;
    $('[data-show-all-source]').addClass('hidden');
    $('[data-app-source]').removeClass('hidden');
    var orderedDataSources = sortDataSources('updatedAt', 'desc');
    renderDataSources(orderedDataSources);
  })
  .on('click', '[data-app-source]', function() {
    isShowingAll = false;
    $('[data-app-source]').addClass('hidden');
    $('[data-show-all-source]').removeClass('hidden');
    var orderedDataSources = sortDataSources('updatedAt', 'desc');
    renderDataSources(orderedDataSources);
  })
  .on('click', '[data-back]', function(event) {
    event.preventDefault();
    if (!dataSourceEntriesHasChanged || confirm('Are you sure? Changes that you made may not be saved.')) {
      try{
        table.destroy();
      } catch(e) {
      }
      dataSourceEntriesHasChanged = false;
      $('.data-save-updated').addClass('hidden');
      $('.name-wrapper').removeClass('saved');
      $('[data-order-date]').removeClass('asc').addClass('desc');
      getDataSources();
    }
  })
  .on('click', '[data-save]', function(event) {
    event.preventDefault();

    var saveData = dataSourceEntriesHasChanged ? saveCurrentData() : Promise.resolve();
    dataSourceEntriesHasChanged = false;

    saveData.then(function() {
      // Return to parent widget if in overlay
      if (copyData.context === 'overlay') {
        Fliplet.Studio.emit('close-overlay');
        return;
      }

      $('.data-save-updated').html('All changes saved!');
    })
  })
  .on('click', '[save-settings]', function() {
    $('form[data-settings]').submit();
  })
  .on('click', '[data-browse-source]', function (event) {
    event.preventDefault();
    currentDataSourceId = $(this).closest('.data-source').data('id');
    browseDataSource(currentDataSourceId);
  })
  .on('click', '[data-delete-source]', function(event) {
    event.preventDefault();
    var confirmAlert = confirm('Are you sure you want to delete this data source? All entries will be deleted.');

    if (confirmAlert) {
      Fliplet.DataSources.delete(currentDataSourceId).then(function() {
        // Remove from UI
        $('.data-source[data-id="' + currentDataSourceId + '"]').remove();

        // Remove from dataSources
        dataSources = dataSources.filter(function(ds) {
          return ds.id !== currentDataSourceId;
        });

        // Return to parent widget if in overlay
        if (copyData.context === 'overlay') {
          Fliplet.Studio.emit('close-overlay');
          return;
        }
        // Go back
        $('[data-back]').click();
      });
    }
  })
  .on('click', '[data-create-source]', function(event) {
    event.preventDefault();
    createDataSource ();
  })
  .on('change', 'input[type="file"]', function(event) {
    var $input = $(this);
    var file = $input[0].files[0];
    var formData = new FormData();

    formData.append('file', file);

    currentDataSource.import(formData).then(function(files) {
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
      userId = prompt('Enter the user ID');

      if (userId) {
        permissions = prompt('Set the permissions', 'crudq');
      }

      if (!userId || !permissions) {
        _this.removeClass('disabled').text('Add new user');
        return;
      }

      Fliplet.DataSources.connect(currentDataSourceId).then(function(source) {
        _this.removeClass('disabled').text('Add new user');
        return source.addUserRole({
          userId: userId,
          permissions: permissions
        });
      }).then(fetchCurrentDataSourceUsers, function(err) {
        _this.removeClass('disabled').text('Add new user');
        alert(err.responseJSON.message);
      });
    }, 100);
  })
  .on('click', '[data-revoke-role]', function(event) {
    event.preventDefault();
    var userId = $(this).data('revoke-role');

    if (!confirm('Are you sure you want to revoke this role?')) {
      return;
    }

    Fliplet.DataSources.connect(currentDataSourceId).then(function(source) {
      return source.removeUserRole(userId);
    }).then(function() {
      fetchCurrentDataSourceUsers();
    });
  })
  .on('submit', 'form[data-settings]', function(event) {
    event.preventDefault();
    var name = $settings.find('#name').val();
    var bundle = !$('#bundle').is(':checked');
    var definition = definitionEditor.getValue();
    var hooks = hooksEditor.getValue();

    if (!name) {
      Fliplet.Navigate.popup({
        popupTitle: 'Invalid settings',
        popupMessage: 'Name must be set'
      });
      return;
    }

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
      hooks.forEach(function (hook) {
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
        // update name on ui
        $('.editing-data-source-name').html(name);

        // Return to parent widget if in overlay
        if (copyData.context === 'overlay') {
          Fliplet.Studio.emit('close-overlay');
          return;
        }
        // go to entries
        $('[aria-controls="entries"]').click();
      });
  })
  .on('keyup change paste', '.search', function() {
    // Escape search
    var s = this.value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    var term = new RegExp(s, "i");
    $noResults.removeClass('show');

    var search = dataSources.filter(function(dataSource) {
      return dataSource.name.match(term) || dataSource.id.toString().match(term)
    });

    $dataSources.html('');
    if (search.length === 0 && dataSources.length) {
      $noResults.addClass('show');
    }

    var html = [];
    search.forEach(function (dataSource) {
      html.push(getDataSourceRender(dataSource));
    });
    $dataSources.html(html.join(''));
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
  .on('shown.bs.tab', function (e) {
    var confirmData;

    if ($(e.target).attr('aria-controls') !== 'entries') {
      if (dataSourceEntriesHasChanged) {
        confirmData = confirm('Are you sure? Changes that you made may not be saved.');
        if (!confirmData) {
          $('[aria-controls="entries"]').click();
          return;
        }

        dataSourceEntriesHasChanged = false;
        $('[data-save]').addClass('hidden');
        $('.data-save-updated').removeClass('hidden');
        $('.name-wrapper').addClass('saved');
        try{
          table.destroy();
          fetchCurrentDataSourceEntries();
        } catch(e) {}
      }
    } else {
      hot.render();
      $('.save-btn').removeClass('hidden');
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

      if (copyData.context === 'overlay') {
        $('.save-btn').addClass('hidden');
        $('.back-name-holder').addClass('hide-date');
      }
    }
  });

$('#show-settings').click(function () {
  setTimeout(function () {
    definitionEditor.refresh();
    hooksEditor.refresh();
  }, 0);
});

if (copyData.context === 'overlay') {
  // Enter data source when the provider starts if ID exists
  $('[data-save]').addClass('hidden');
  $('.data-save-updated').addClass('hidden');
  $('.name-wrapper').removeClass('saved');
  browseDataSource(copyData.dataSourceId);
} else {
  // Fetch data sources when the provider starts
  getDataSources();
}
