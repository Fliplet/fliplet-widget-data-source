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

// CHeck if user is on Apple MacOS system
function isMac() {
  return navigator.platform.indexOf('Mac') > -1
}

// Fetch all data sources
function getDataSources() {
  $contents.removeClass('hidden');
  $sourceContents.addClass('hidden');
  $('[data-save]').addClass('disabled');

  // If we already have data sources no need to go further.
  if (dataSources) {
    return;
  }

  Fliplet.DataSources.get({
      roles: 'publisher,editor',
      type: null
    })
    .then(function onGetDataSources(userDataSources) {
      dataSources = userDataSources;
      $dataSources.empty();
      dataSources.forEach(renderDataSource);
    });
}

function fetchCurrentDataSourceDetails() {
  return Fliplet.DataSources.getById(currentDataSourceId).then(function(dataSource) {
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
        columns = dataSource.columns || [];

        if (entries) {
          return Promise.resolve(entries);
        }

        return source.find({}).catch(function() {
          return Promise.reject('Access denied. Please review your security settings if you want to access this data source.');
        });
      });
    }).then(function(rows) {
      if (!rows || !rows.length) {
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
        if (Raven) {
          Raven.captureException(error, { extra: { dataSourceId: currentDataSourceId } });
        }
      } else {
        if (Raven) {
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
  $('.entries-message').html('Saving...');
  var entries = table.getData();
  var columns = table.getColumns();

  return currentDataSource.commit(entries, columns)
    .then(function() {
      // Clear hot div
      try{
        table.destroy();
      } catch(e) {
      }
    });
}

// Append a data source to the DOM
function renderDataSource(data) {
  var tpl = Fliplet.Widget.Templates['templates.dataSource'];
  var html = tpl(data);
  $dataSources.append(html);
}

function windowResized() {
  $('.tab-content').height($('body').height() - $('.tab-content').offset().top);
  $('.table-entries').height($('.tab-content').height());
  $('#contents:visible').height($('body').height() - $('#contents').offset().top);
}

function browseDataSource(id) {
  currentDataSourceId = id;
  $contents.addClass('hidden');
  $('.entries-message').html('<br>Loading data...');
  $sourceContents.removeClass('hidden');
  $('[href="#entries"]').click();
  $sourceContents.find('h1').html(name);
  windowResized();

  // Input file temporarily disabled
  // $contents.append('<form>Import data: <input type="file" /></form><hr /><div id="entries"></div>');

  Promise.all([
      fetchCurrentDataSourceEntries(),
      fetchCurrentDataSourceUsers(),
      fetchCurrentDataSourceDetails()
    ])
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
      getDataSources();
    }
  })
  .on('click', '[data-save]', function(event) {
    event.preventDefault();

    var saveData = dataSourceEntriesHasChanged ? saveCurrentData() : Promise.resolve();
    dataSourceEntriesHasChanged = false;

    saveData.then(function() {
      getDataSources();
    })
  })
  .on('click', '[data-browse-source]', function (event) {
    event.preventDefault();
    currentDataSourceId = $(this).closest('.data-source').data('id');
    browseDataSource(currentDataSourceId);
  })
  .on('click', '[data-delete-source]', function(event) {
    event.preventDefault();
    if (!confirm('Are you sure you want to delete this data source? All entries will be deleted.')) {
      return;
    }

    Fliplet.DataSources.delete(currentDataSourceId).then(function() {
      // Remove from UI
      $('[data-id=' + currentDataSourceId + ']').remove();

      // Remove from dataSources
      dataSources = dataSources.filter(function(ds) {
        return ds.id !== currentDataSourceId;
      });

      // Go back
      $('[data-back]').click();
    });
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
    var userId = prompt('User ID');
    var permissions = prompt('Permissions', 'crudq');

    if (!userId || !permissions) {
      return;
    }

    Fliplet.DataSources.connect(currentDataSourceId).then(function(source) {
      return source.addUserRole({
        userId: userId,
        permissions: permissions
      });
    }).then(fetchCurrentDataSourceUsers, function(err) {
      alert(err.responseJSON.message);
    });
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
        $('.data-source[data-id="' + currentDataSourceId + '"] a[data-browse-source]').text(name);

        // go back
        $('[data-back]').click();
      });
  })
  .on('click', '#cancel', function() {
    $('[data-back]').click();
  })
  .on('keyup change paste', '.search', function() {
    // Escape search
    var s = this.value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    var term = new RegExp(s, "i");
    $noResults.removeClass('show');

    var search = dataSources.filter(function(dataSource) {
      return dataSource.name.match(term);
    });

    $dataSources.empty();
    if (search.length === 0 && dataSources.length) {
      $noResults.addClass('show');
    }
    search.forEach(renderDataSource);
  })
  .on('click', '#get-backdoor', function(event) {
    event.preventDefault();
    Fliplet.API.request('v1/data-sources/' + currentDataSourceId + '/validation-code')
      .then(function(result) {
        if (result.code) {
          $settings.find('#backdoor').val(result.code);
        }
      });
  })

// Fetch data sources when the provider starts
getDataSources();
