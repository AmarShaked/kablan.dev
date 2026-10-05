/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // --- chats: add dm kind + deterministic dm_key for 1:1 threads ---
    const chats = app.findCollectionByNameOrId('chats');
    const kind = chats.fields.getByName('kind');
    kind.values = ['self', 'dm', 'group'];

    chats.fields.add(
      new Field({
        name: 'dm_key',
        type: 'text',
        required: false,
      })
    );
    chats.indexes.push(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_dm_key ON chats (dm_key) WHERE dm_key != ""'
    );
    app.save(chats);

    // --- chat_members: owners can add others; members can see peers ---
    const members = app.findCollectionByNameOrId('chat_members');
    const memberOfChat =
      '@collection.chat_members.chat ?= chat && @collection.chat_members.user ?= @request.auth.id';
    const ownerOfChat =
      '@collection.chat_members.chat ?= chat && @collection.chat_members.user ?= @request.auth.id && @collection.chat_members.role = "owner"';

    members.listRule = `@request.auth.id != "" && (user = @request.auth.id || (${memberOfChat}))`;
    members.viewRule = `@request.auth.id != "" && (user = @request.auth.id || (${memberOfChat}))`;
    // Add yourself, or add someone else when you already own the chat.
    members.createRule = `@request.auth.id != "" && (user = @request.auth.id || (${ownerOfChat}))`;
    app.save(members);

    // --- users: signed-in accounts can look each other up by email for DMs ---
    const users = app.findCollectionByNameOrId('users');
    users.listRule = '@request.auth.id != ""';
    users.viewRule = '@request.auth.id != ""';
    app.save(users);
  },
  (app) => {
    const chats = app.findCollectionByNameOrId('chats');
    try {
      chats.fields.removeByName('dm_key');
    } catch (_) {}
    const kind = chats.fields.getByName('kind');
    kind.values = ['self', 'group'];
    chats.indexes = (chats.indexes || []).filter(
      (idx) => !String(idx).includes('idx_chats_dm_key')
    );
    app.save(chats);

    const members = app.findCollectionByNameOrId('chat_members');
    members.listRule = '@request.auth.id != "" && user = @request.auth.id';
    members.viewRule = '@request.auth.id != "" && user = @request.auth.id';
    members.createRule =
      '@request.auth.id != "" && user = @request.auth.id';
    app.save(members);

    const users = app.findCollectionByNameOrId('users');
    users.listRule = 'id = @request.auth.id';
    users.viewRule = 'id = @request.auth.id';
    app.save(users);
  }
);
