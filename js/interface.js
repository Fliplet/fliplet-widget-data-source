var $dataSourcesList = $('#datasources-list');
var templates = {
  dataSource: template('dataSource')
};

// Function to compile a Handlebars template
function template(name) {
  return Handlebars.compile($('#template-' + name).html());
}

// Fetch all data sources
function getDataSources(folderId) {
  Fliplet.DataSources.get().then(function (response) {
    response.dataSources.forEach(addDataSource);
  });
}

// Append a data source to the DOM
function addDataSource(data) {
  $dataSourcesList.append(templates.dataSource(data));
}

// events
$('#app')
  .on('click', '[data-browse-source]', function (event) {
    event.preventDefault();
    browseDataSource($(this).closest('li').data('id'));
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
    }).then(addDataSource);
  });

// Fetch data sources when the provider starts
getDataSources();
