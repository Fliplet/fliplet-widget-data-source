Fliplet.Registry.set('preconfigured-rules', [
  {
    name: 'All users can read',
    rules: [
      { "type": ["select"], "allow": "all" }
    ]
  },
  {
    name: 'Logged in users can write',
    rules: [
      { "type": ["insert"], "allow": "loggedIn" }
    ]
  },
  {
    name: 'Admins user types have full access and offline access',
    rules: [
      {
        "type": ["select", "insert", "update", "delete"],
        "allow": { "user": { "Admin": { "equals": "Yes" } } }
      }
    ]
  },
  {
    name: 'Users can only retrieve some fields',
    rules: [
      {
        "type": ["select"],
        "allow": "all",
        "exclude": ["Password"]
      }
    ]
  },
  {
    name: 'Users can only insert records if they provide their account ID',
    rules: [
      {
        "type": ["select"],
        "allow": "all",
        "require": ["Account ID"]
      }
    ]
  }
]);