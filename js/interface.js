var $contents = $('#contents');
var $tableContents;

var templates = {
  dataSource: template('dataSource')
};

var currentDataSource;
var currentDataSourceId;

var tinyMCEConfiguration = {
  menubar: false,
  statusbar: false,
  inline: true,
  valid_elements : "tr,th,td[colspan|rowspan],thead,tbody,table,tfoot",
  valid_styles: {},
  plugins: "paste, table",
  gecko_spellcheck: true,
  toolbar: "table",
  height: "317px",
  resize: false,
  paste_auto_cleanup_on_paste : false,
  paste_remove_styles: true,
  paste_remove_styles_if_webkit: true
};

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

    var $entries = $contents.find('#entries');

    var tableHead = '<tr>' + Object.keys(rows[0]).map(function (column) {
      return '<td>' + column + '</td>';
    }).join('') + '</tr>';

    var tableBody = rows.map(function (row) {
      return '<tr>' + Object.keys(row).map(function (key) {
        return '<td>' + row[key] + '</td>';
      }).join('') + '</tr>';
    }).join('');

    var tableTpl = '<table class="table">' + tableHead + tableBody + '</table>';

    $tableContents.html(tableTpl);
    $tableContents.tinymce(tinyMCEConfiguration);
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

    // Prepare the html
    $contents.html('');
    $contents.append('<a href="#" data-back>Back to data sources</a>');
    $contents.append('<h1>' + name + '</h1>');
    $contents.append('<div class="table-contents"></div>');
    $tableContents = $contents.find('.table-contents');

    // Input file temporarily disabled
    // $contents.append('<form>Import data: <input type="file" /></form><hr /><div id="entries"></div>');

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