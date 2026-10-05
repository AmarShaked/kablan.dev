/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // Create chats first without membership-based rules (reverse relation
    // does not exist until chat_members is saved).
    const chats = new Collection({
      name: 'chats',
      type: 'base',
      listRule: '@request.auth.id != "" && created_by = @request.auth.id',
      viewRule: '@request.auth.id != "" && created_by = @request.auth.id',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && created_by = @request.auth.id',
      deleteRule: '@request.auth.id != "" && created_by = @request.auth.id',
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'kind',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['self', 'group'],
        },
        {
          name: 'created_by',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(chats);

    const members = new Collection({
      name: 'chat_members',
      type: 'base',
      listRule: '@request.auth.id != "" && user = @request.auth.id',
      viewRule: '@request.auth.id != "" && user = @request.auth.id',
      createRule: '@request.auth.id != "" && user = @request.auth.id',
      updateRule: null,
      deleteRule: '@request.auth.id != "" && user = @request.auth.id',
      fields: [
        {
          name: 'chat',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: chats.id,
          cascadeDelete: true,
        },
        {
          name: 'user',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
        },
        {
          name: 'role',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['owner', 'member'],
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_chat_members_chat_user ON chat_members (chat, user)',
      ],
    });
    app.save(members);

    // Membership OR ownership (phase 1 self-chats + later invites).
    const chatsSaved = app.findCollectionByNameOrId('chats');
    chatsSaved.listRule =
      '@request.auth.id != "" && (created_by = @request.auth.id || (@collection.chat_members.chat ?= id && @collection.chat_members.user ?= @request.auth.id))';
    chatsSaved.viewRule =
      '@request.auth.id != "" && (created_by = @request.auth.id || (@collection.chat_members.chat ?= id && @collection.chat_members.user ?= @request.auth.id))';
    app.save(chatsSaved);

    const memberFilter =
      '@collection.chat_members.chat ?= chat.id && @collection.chat_members.user ?= @request.auth.id';

    const messages = new Collection({
      name: 'messages',
      type: 'base',
      listRule: `@request.auth.id != "" && (${memberFilter})`,
      viewRule: `@request.auth.id != "" && (${memberFilter})`,
      // Users post as themselves. Agent posts use the PocketBase admin API from Kablan.
      createRule: `@request.auth.id != "" && (${memberFilter}) && author_user = @request.auth.id && author_agent = ""`,
      updateRule: null,
      deleteRule:
        '@request.auth.id != "" && author_user = @request.auth.id',
      fields: [
        {
          name: 'chat',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: chats.id,
          cascadeDelete: true,
        },
        {
          name: 'author_user',
          type: 'relation',
          required: false,
          maxSelect: 1,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
        },
        {
          name: 'author_agent',
          type: 'text',
          required: false,
        },
        {
          name: 'body',
          type: 'text',
          required: true,
        },
        {
          name: 'mentions',
          type: 'json',
          required: false,
        },
        {
          name: 'task_project_id',
          type: 'text',
          required: false,
        },
        {
          name: 'task_id',
          type: 'text',
          required: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_messages_chat_created ON messages (chat, created)',
      ],
    });
    app.save(messages);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('messages'));
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('chat_members'));
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('chats'));
    } catch (_) {}
  }
);
