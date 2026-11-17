/* eslint-env jest */
var ProjectLinks = require('../js/projectLinks');

// A stand-in for v1/apps/:id and its settings route, which replaces the whole list
function fakeApi(initial) {
  var stored = initial.slice();
  var calls = [];
  var request = jest.fn(function(options) {
    calls.push(options);

    if (options.method === 'POST') {
      stored = options.data.customDataSourcesInUse.slice();

      return Promise.resolve({});
    }

    return Promise.resolve({ app: { id: 7, name: 'Events', settings: { customDataSourcesInUse: stored.map(String) } } });
  });

  return { request: request, calls: calls, stored: function() { return stored; } };
}

describe('ProjectLinks.create', function() {
  it('reads the app\'s list and name', function() {
    var api = fakeApi([3]);
    var links = ProjectLinks.create({ appId: 7, request: api.request });

    expect(links.loaded()).toBe(false);

    return links.load().then(function(linked) {
      expect(linked).toEqual([3]);
      expect(links.loaded()).toBe(true);
      expect(links.name()).toBe('Events');
      expect(api.calls[0]).toEqual({ url: 'v1/apps/7' });
    });
  });

  it('adds to the list it reads just before saving, keeping what someone else added since', function() {
    var api = fakeApi([3]);
    var links = ProjectLinks.create({ appId: 7, request: api.request });

    return links.load().then(function() {
      // Another tab or the AI links 5 after this list was read
      api.stored().push(5);

      return links.add(9);
    }).then(function() {
      expect(api.stored()).toEqual([3, 5, 9]);
      expect(links.linked()).toEqual([3, 5, 9]);
    });
  });

  it('saves nothing when the data source is already on the list, or already off it', function() {
    var api = fakeApi([3]);
    var links = ProjectLinks.create({ appId: 7, request: api.request });

    return links.add(3).then(function() {
      return links.remove(4);
    }).then(function() {
      expect(api.calls.filter(function(call) { return call.method === 'POST'; })).toHaveLength(0);
    });
  });

  it('runs quick changes one after another, so the second doesn\'t undo the first', function() {
    var api = fakeApi([]);
    var links = ProjectLinks.create({ appId: 7, request: api.request });

    return Promise.all([links.add(1), links.add(2), links.remove(1)]).then(function() {
      expect(api.stored()).toEqual([2]);
    });
  });

  it('keeps going after a failed save, and the failure reaches the caller', function() {
    var api = fakeApi([]);
    var links = ProjectLinks.create({ appId: 7, request: api.request });
    var refusal = { status: 400, responseJSON: { message: 'You don\'t have access to data source 4' } };

    api.request.mockImplementationOnce(function() { return Promise.resolve({ app: { settings: {} } }); });
    api.request.mockImplementationOnce(function() { return Promise.reject(refusal); });

    return links.add(1).then(function() {
      throw new Error('should have failed');
    }, function(error) {
      expect(error).toBe(refusal);

      return links.add(2);
    }).then(function() {
      expect(api.stored()).toEqual([2]);
    });
  });
});

describe('ProjectLinks.menuItems', function() {
  var api;
  var links;
  var context;

  beforeEach(function() {
    api = fakeApi([3]);
    links = ProjectLinks.create({ appId: 7, request: api.request });
    context = { askAi: true, links: links, appLabel: 'project' };

    return links.load();
  });

  it('offers Add for a data source not on the app\'s list, even one the app owns or a screen reads', function() {
    [{ id: 9, apps: [] }, { id: 9, appId: 7, apps: [{ id: 7 }] }, { id: 4, apps: [{ id: 7 }] }].forEach(function(dataSource) {
      var html = ProjectLinks.menuItems(dataSource, context);

      expect(html).toContain('Ask AI');
      expect(html).toContain('Add to this project');
      expect(html).not.toContain('Unlink');
    });
  });

  it('offers Unlink for one on the app\'s list that another app made', function() {
    var html = ProjectLinks.menuItems({ id: 3, appId: 8, apps: [{ id: 7 }] }, context);

    expect(html).toContain('Unlink from this project');
    expect(html).not.toContain('Add to');
  });

  it('never offers Unlink for one the app made, even on its list', function() {
    var html = ProjectLinks.menuItems({ id: 3, appId: 7, apps: [{ id: 7 }] }, context);

    expect(html).not.toContain('Unlink');
    expect(html).not.toContain('Add to');
  });

  it('says "app" in V2 and leaves out Ask AI', function() {
    var html = ProjectLinks.menuItems({ id: 9, apps: [] }, { askAi: false, links: links, appLabel: 'app' });

    expect(html).toBe('<li data-add-to-project><a href="#">Add to this app</a></li>');
  });

  it('adds nothing without an app', function() {
    expect(ProjectLinks.menuItems({ id: 9, apps: [] }, { askAi: false, links: null, appLabel: 'app' })).toBe('');
  });
});
