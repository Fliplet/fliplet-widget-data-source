var $contents = $('#contents');
var templates = {
  dataSource: template('dataSource')
};

var currentDataSource;
var currentDataSourceId;

// Function to compile a Handlebars template
function template(name) {
  return Handlebars.compile($('#template-' + name).html());
}

// Fetch all data sources
function getDataSources(folderId) {
  $contents.html('<button data-create-source class="btn btn-primary">Create new </button><hr />');
  Fliplet.DataSources.get().then(function (response) {
    response.dataSources.forEach(renderDataSource);
  });
}

function fetchCurrentDataSourceEntries() {
  Fliplet.DataSources.connect(currentDataSourceId).then(function (source) {
    currentDataSource = source;
    return source.find();
  }).then(function (rows) {
    if (!rows.length) {
      return;
    }

    var tableHead = '<thead>' + Object.keys(rows[0]).map(function (column) {
      return '<th>' + column + '</th>';
    }).join('') + '</thead>';

    var tableBody = '<tbody>' + rows.map(function (row) {
      return '<tr>' + Object.keys(row).map(function (key) {
        return '<td>' + row[key] + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody>';

    tableTpl = '<table class="table">' + tableHead + tableBody + '</table>';

    $contents.find('#entries').html(tableTpl);
  });
}

// Append a data source to the DOM
function renderDataSource(data) {
  $contents.append(templates.dataSource(data));
}

// events
$('#app')
  .on('click', '[data-back]', function (event) {
    event.preventDefault();
    getDataSources();
  })
  .on('click', '[data-browse-source]', function (event) {
    event.preventDefault();
    currentDataSourceId = $(this).closest('li').data('id');
    var name = $(this).html();

    $contents.html('');
    $contents.append('<a href="#" data-back>Back to data sources</a>');
    $contents.append('<h1>' + name + '</h1>');
    $contents.append('<form>Import data: <input type="file" /></form><hr /><div id="entries"></div>');

    fetchCurrentDataSourceEntries();
  })
  .on('click', '[data-delete-source]', function (event) {
    event.preventDefault();
    var $item = $(this).closest('li');

    Fliplet.DataSources.delete($item.data('id')).then(function () {
      $item.remove();
    });
  })
  .on('click', '[data-create-source]', function (event) {
    event.preventDefault();
    var sourceName = prompt('Type data source name');

    if (!sourceName) {
      return;
    }

    Fliplet.DataSources.create({
      name: sourceName
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
  });

// Fetch data sources when the provider starts
getDataSources();
