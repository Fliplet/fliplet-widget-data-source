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
var currentEditor;
var dataSources;
var table;
var dataSourceEntriesHasChanged = false;

var widgetId = parseInt(Fliplet.Widget.getDefaultId(), 10);
var data = Fliplet.Widget.getData(widgetId) || {};
var copyData = data;

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

  Fliplet.DataSources.get({
      roles: 'publisher,editor',
      type: null
    }, {
      cache: false
    })
    .then(function(userDataSources) {
      dataSources = userDataSources;
      $dataSources.html('');
      dataSources.forEach(renderDataSource);
      $initialSpinnerLoading.removeClass('animated');
      $contents.removeClass('hidden');
    });
}

function fetchCurrentDataSourceDetails() {
  return Fliplet.DataSources.getById(currentDataSourceId, { cache: false }).then(function(dataSource) {
    $settings.find('#id').html(dataSource.id);
    $settings.find('[name="name"]').val(dataSource.name);
    if (!dataSource.bundle) {
      $('#bundle').prop('checked', true);
    }
    if (dataSource.definition) {
      $('#definition').val(JSON.stringify(dataSource.definition, null, 2));
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

  // Let's also try to save widths on local storage.
  // This way we can try to load widths on next load
  widths = table.getColWidths();
  Fliplet.Storage.set('hotWidths_' + currentDataSourceId, widths);

  return currentDataSource.commit(entries, columns);
}

// Append a data source to the DOM
function renderDataSource(data) {
  var tpl = Fliplet.Widget.Templates['templates.dataSource'];
  var html = tpl(data);
  $dataSources.append(html);
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
            dataSources = updatedDataSources;
            $dataSources.html('');
            dataSources.forEach(renderDataSource);
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

// events
$(window).on('resize', windowResized).trigger('resize');
$('#app')
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
    var sourceName = prompt('Please type the new table name:');

    if (!sourceName) {
      return;
    }

    Fliplet.Organizations.get().then(function(organizations) {
      return Fliplet.DataSources.create({
        organizationId: organizations[0].id,
        name: sourceName
      });
    }).then(function(createdDataSource) {
      dataSources.push(createdDataSource);
      renderDataSource(createdDataSource);
      browseDataSource(createdDataSource.id);
    });
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
    var definition = $settings.find('#definition').val();
    if (!name) {
      return;
    }

    try {
      definition = JSON.parse(definition);
    } catch (e) {
      Fliplet.Navigate.popup({
        popupTitle: 'Invalid settings',
        popupMessage: 'Definition MUST be a valid JSON'
      });
      return;
    }

    Fliplet.DataSources.update({
        id: currentDataSourceId,
        name: name,
        bundle: bundle,
        definition: definition
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
      return dataSource.name.match(term);
    });

    $dataSources.html('');
    if (search.length === 0 && dataSources.length) {
      $noResults.addClass('show');
    }
    search.forEach(renderDataSource);
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
