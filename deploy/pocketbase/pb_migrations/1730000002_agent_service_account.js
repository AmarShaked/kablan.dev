/// <reference path="../pb_data/types.d.ts" />

/**
 * Kablan agent service account: may read all messages and write agent
 * replies (author_agent set). Humans still cannot forge agent messages.
 *
 * Email/password must stay in sync with crates/server/src/pocketbase.rs defaults.
 */
const SERVICE_EMAIL = 'agent@kablan.service';
const SERVICE_PASSWORD = 'V6VI1lm2q25/EwPOpANAXN+2OyncQwUCFL31n53GW8A=';
const SERVICE_NAME = 'Kablan Agent';

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    let service;
    try {
      service = app.findFirstRecordByFilter(
        'users',
        'email = {:email}',
        { email: SERVICE_EMAIL }
      );
    } catch (_) {
      service = new Record(users);
      service.set('email', SERVICE_EMAIL);
      service.set('password', SERVICE_PASSWORD);
      service.set('passwordConfirm', SERVICE_PASSWORD);
      service.set('name', SERVICE_NAME);
      service.set('verified', true);
      app.save(service);
    }

    const isService = `@request.auth.email = "${SERVICE_EMAIL}"`;
    const memberFilter =
      '@collection.chat_members.chat ?= chat.id && @collection.chat_members.user ?= @request.auth.id';

    const messages = app.findCollectionByNameOrId('messages');
    messages.listRule = `@request.auth.id != "" && ((${memberFilter}) || (${isService}))`;
    messages.viewRule = `@request.auth.id != "" && ((${memberFilter}) || (${isService}))`;
    // Humans: as themselves, no agent. Service: agent replies only (no author_user).
    messages.createRule =
      `@request.auth.id != "" && (` +
      `((${memberFilter}) && author_user = @request.auth.id && author_agent = "") || ` +
      `(${isService} && author_agent != "" && author_user = "")` +
      `)`;
    messages.updateRule = `${isService} && author_agent != ""`;
    messages.deleteRule =
      `@request.auth.id != "" && (` +
      `author_user = @request.auth.id || (${isService} && author_agent != "")` +
      `)`;
    app.save(messages);
  },
  (app) => {
    const memberFilter =
      '@collection.chat_members.chat ?= chat.id && @collection.chat_members.user ?= @request.auth.id';
    const messages = app.findCollectionByNameOrId('messages');
    messages.listRule = `@request.auth.id != "" && (${memberFilter})`;
    messages.viewRule = `@request.auth.id != "" && (${memberFilter})`;
    messages.createRule = `@request.auth.id != "" && (${memberFilter}) && author_user = @request.auth.id && author_agent = ""`;
    messages.updateRule = null;
    messages.deleteRule =
      '@request.auth.id != "" && author_user = @request.auth.id';
    app.save(messages);

    try {
      const service = app.findFirstRecordByFilter(
        'users',
        'email = {:email}',
        { email: SERVICE_EMAIL }
      );
      app.delete(service);
    } catch (_) {}
  }
);
