var $contents = $('#contents');
var $sourceContents = $('#source-contents');
var $dataSources;
var $tableContents;
var $settings = $('form[data-settings]');
var ignoreDataSourceTypes = ['menu'];

var templates = {
  dataSources: template('dataSources'),
  dataSource: template('dataSource'),
  users: template('users')
};

var organizationId = Fliplet.Env.get('organizationId');
var currentDataSource;
var currentDataSourceId;
var currentEditor;

var dataSourceEntriesHasChanged = false;

var tinyMCEConfiguration = {
  menubar: false,
  statusbar: false,
  inline: true,
  valid_elements : "tr,th,td[colspan|rowspan],thead,tbody,table,tfoot",
  valid_styles: {},
  plugins: "paste, table",
  gecko_spellcheck: true,
  toolbar: 'undo redo | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol',
  contextmenu: "tableprops | cell row column",
  table_toolbar: "",
  object_resizing: false,
  paste_auto_cleanup_on_paste : false,
  paste_remove_styles: true,
  paste_remove_styles_if_webkit: true,
  setup: function (editor) {
    editor.on('change paste cut', function(e) {
      dataSourceEntriesHasChanged = true;
      $('[data-save]').removeClass('disabled');
    });
  }
};

// Function to compile a Handlebars template
function template(name) {
  return Handlebars.compile($('#template-' + name).html());
}

// Fetch all data sources
function getDataSources() {
  if (tinymce.editors.length) {
    tinymce.editors[0].remove();
  }

  $contents.removeClass('hidden');
  $sourceContents.addClass('hidden');
  $('[data-save]').addClass('disabled');
  $contents.html(templates.dataSources());
  $dataSources = $('#data-sources > tbody');

  Fliplet.DataSources.get().then(function (dataSources) {
    var filteredDataSources = dataSources.filter(function (dataSource) {
      for (var i = 0; i < ignoreDataSourceTypes.length; i++) {
        if (ignoreDataSourceTypes[i] === dataSource.type) {
          return false;
        }
      }
      return true;
    });

    filteredDataSources.forEach(renderDataSource);
  });
}

function fetchCurrentDataSourceDetails() {
  return Fliplet.DataSources.getById(currentDataSourceId).then(function (dataSource) {
    $settings.find('[name="name"]').val(dataSource.name);
    if (!dataSource.bundle) {
      $('#bundle').prop('checked', true);
    }
  });
}

function fetchCurrentDataSourceUsers() {
  var $usersContents = $('#roles');

  return Fliplet.DataSources.connect(currentDataSourceId).then(function (source) {
    source.getUsers().then(function (users) {
      $usersContents.html(templates.users({ users: users }));
    });
  });
}

function fetchCurrentDataSourceEntries() {
  var columns;

  return Fliplet.DataSources.connect(currentDataSourceId).then(function (source) {
    currentDataSource = source;
    return Fliplet.DataSources.getById(currentDataSourceId).then(function (dataSource) {
      columns = dataSource.columns;

      return source.find({});
    });
  }).then(function (rows) {
    if (!rows || !rows.length) {
      rows = [{data: { id: 1, name: 'Sample row 1'}}, {data: {id: 2, name: 'Sample row 2'}}];
      columns = ['id', 'name'];
    } else {
      columns = _.union.apply(this, rows.map(function (row) { return Object.keys(row.data); }));
    }

    columns = columns || [];

    var tableHead = '<tr>' + columns.map(function (column) {
      return '<td>' + column + '</td>';
    }).join('') + '</tr>';

    var tableBody = rows.map(function (row) {
      return '<tr>' + columns.map(function (column) {
        var value = row.data[column] || '';

        if (typeof value === 'object') {
          value = JSON.stringify(value);
        } else if (typeof value === 'string' && value.indexOf('<') !== -1) {
          value = $('<div>').text(value).html();
        }

        return '<td>' + value + '</td>';
      }).join('') + '</tr>';
    }).join('');

    var tableTpl = '<table class="table">' + tableHead + tableBody + '</table>';

    $('.table-entries').css('visibility','visible');

    $tableContents = $('#entries > .table-entries');
    $tableContents.html(tableTpl);
    currentEditor = $tableContents.tinymce(tinyMCEConfiguration);
  })
    .catch(function onFetchError(error) {
      $('.table-entries').html('<br>Access denied. Please review your security settings if you want to access this data source.');
    });
}

Fliplet.Widget.onSaveRequest(function () {
  saveCurrentData().then(Fliplet.Widget.complete);
});

function saveCurrentData() {
  if (!tinymce.editors.length) {
    return Promise.resolve();
  }

  var $table = $('<div>' + tinymce.editors[0].getContent() + '</div>');

  // Append the table to the dom so "tableToJSON" works fine
  $table.css('visibility', 'hidden');
  $('body').append($table)

  var tableRows = $table.find('table').tableToJSON();

  tableRows.forEach(function (row) {
    Object.keys(row).forEach(function (column) {
      var value = row[column];

      try {
        // Convert value to JSON data when necessary (arrays and objects)
        row[column] = JSON.parse(value);
      }
      catch (e) {
        // Convert value to number when necessary
        if (!isNaN(value) && !value.match(/^(\+|0)/)) {
          row[column] = parseFloat(value, 10)
        } else {
          // Convert value to boolean
          if (value === 'true') {
            value = true;
          } else if (value === 'false') {
            value = false;
          }
        }
      }
    });
  });

  $('.table-entries').html('Saving...');

  return currentDataSource.replaceWith(tableRows);
}

// Append a data source to the DOM
function renderDataSource(data) {
  $dataSources.append(templates.dataSource(data));
}

function windowResized() {
  $('.tab-content').height($('body').height() - $('.tab-content').offset().top);
  $('.table-entries').height($('.tab-content').height());
  $('#contents:visible').height($('body').height() - $('#contents').offset().top);
}

// events
$(window).on('resize', windowResized).trigger('resize');
$('#app')
  .on('click', '[data-back]', function (event) {
    event.preventDefault();

    if (!dataSourceEntriesHasChanged || confirm('Are you sure? Changes that you made may not be saved.')) {
      dataSourceEntriesHasChanged = false;
      getDataSources();
    }
  })
  .on('click', '[data-save]', function (event) {
    event.preventDefault();

    var saveData = dataSourceEntriesHasChanged ? saveCurrentData() : Promise.resolve();
    dataSourceEntriesHasChanged = false;

    saveData.then(function () {
      getDataSources();
    })
  })
  .on('click', '[data-browse-source]', function (event) {
    event.preventDefault();
    currentDataSourceId = $(this).closest('.data-source').data('id');
    var name = $(this).closest('.data-source').find('.data-source-name').text();

    $contents.addClass('hidden');
    $('.table-entries').html('<br>Loading data...');
    $sourceContents.removeClass('hidden');
    $sourceContents.find('h1').html(name);
    windowResized();

    // Input file temporarily disabled
    // $contents.append('<form>Import data: <input type="file" /></form><hr /><div id="entries"></div>');

    Promise.all([
      fetchCurrentDataSourceEntries(),
      fetchCurrentDataSourceUsers(),
      fetchCurrentDataSourceDetails()
    ]);
  })
  .on('click', '[data-delete-source]', function (event) {
    event.preventDefault();
    if (!confirm('Are you sure you want to delete this data source? All entries will be deleted.')) {
      return;
    }

    var $item = $(this).closest('.data-source');

    Fliplet.DataSources.delete($item.data('id')).then(function () {
      $item.remove();
    });
  })
  .on('click', '[data-create-source]', function (event) {
    event.preventDefault();
    var sourceName = prompt('Please type the new table name:');

    if (!sourceName) {
      return;
    }

    Fliplet.Organizations.get().then(function (organizations) {
      return Fliplet.DataSources.create({
        organizationId: organizations[0].id,
        name: sourceName
      });
    }).then(renderDataSource);
  })
  .on('change', 'input[type="file"]', function (event) {
    var $input = $(this);
    var file = $input[0].files[0];
    var formData = new FormData();

    formData.append('file', file);

    currentDataSource.import(formData).then(function (files) {
      $input.val('');
      fetchCurrentDataSourceEntries();
    });
  })
  .on('click', '[data-create-role]', function (event) {
    event.preventDefault();
    var userId = prompt('User ID');
    var permissions = prompt('Permissions', 'crudq');

    if (!userId || !permissions) {
      return;
    }

    Fliplet.DataSources.connect(currentDataSourceId).then(function (source) {
      return source.addUserRole({
        userId: userId,
        permissions: permissions
      });
    }).then(fetchCurrentDataSourceUsers, function (err) {
      alert(err.responseJSON.message);
    });
  })
  .on('click', '[data-revoke-role]', function (event) {
    event.preventDefault();
    var userId = $(this).data('revoke-role');

    if (!confirm('Are you sure you want to revoke this role?')) {
      return;
    }

    Fliplet.DataSources.connect(currentDataSourceId).then(function (source) {
      return source.removeUserRole(userId);
    }).then(function () {
      fetchCurrentDataSourceUsers();
    });
  })
  .on('submit', 'form[data-settings]', function (event) {
    event.preventDefault();
    var name = $settings.find('[name="name"]').val();
    var bundle = !$('#bundle').is(':checked');
    if (!name) {
      return;
    }

    Fliplet.DataSources.update({
      id: currentDataSourceId,
      name: name,
      bundle: bundle
    })
      .then(function () {
        $('[data-back]').click();
      });
  });

// Fetch data sources when the provider starts
getDataSources();
