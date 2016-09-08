var $contents = $('#contents');
var templates = {
  dataSource: template('dataSource')
};

// Function to compile a Handlebars template
function template(name) {
  return Handlebars.compile($('#template-' + name).html());
}

// Fetch all data sources
function getDataSources(folderId) {
  $contents.html('');
  Fliplet.DataSources.get().then(function (response) {
    response.dataSources.forEach(renderDataSource);
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
    var id = $(this).closest('li').data('id');
    var name = $(this).html();

    $contents.html('');
    $contents.append('<a href="#" data-back>Back to data sources</a>');
    $contents.append('<h1>' + name + '</h1>');
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
  });

// Fetch data sources when the provider starts
getDataSources();
