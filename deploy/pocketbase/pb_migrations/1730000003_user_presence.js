/// <reference path="../pb_data/types.d.ts" />

/**
 * Presence via users.last_seen. Clients heartbeat while signed in;
 * peers are "online" when last_seen is recent.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.fields.add(
      new Field({
        name: 'last_seen',
        type: 'date',
        required: false,
      })
    );
    // Signed-in users may update only their own record (heartbeat).
    if (!users.updateRule) {
      users.updateRule = 'id = @request.auth.id';
    }
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    try {
      users.fields.removeByName('last_seen');
    } catch (_) {}
    app.save(users);
  }
);
