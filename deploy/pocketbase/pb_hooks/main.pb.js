/// <reference path="../pb_data/types.d.ts" />

/**
 * Exact-email user lookup for starting DMs.
 *
 * PocketBase does not return other users' emails on the users collection API,
 * so a client-side `email = "..."` filter always misses. This hook runs
 * server-side (can read emails) and only returns a match for a signed-in user
 * who already knows the address — no admin credentials on the Kablan app.
 */
routerAdd(
  'POST',
  '/api/kablan/lookup-user',
  (e) => {
    const info = e.requestInfo();
    const body = info.body || {};
    const email = String(body.email || '')
      .trim()
      .toLowerCase();

    if (!email || email.indexOf('@') < 0) {
      throw new BadRequestError('Enter a valid email address');
    }

    let user;
    try {
      user = $app.findFirstRecordByFilter(
        'users',
        'email = {:email}',
        { email: email }
      );
    } catch (_) {
      throw new NotFoundError(
        'They need to create a Chats account first.'
      );
    }

    return e.json(200, {
      id: user.id,
      email: user.getString('email'),
      name: user.getString('name') || null,
    });
  },
  $apis.requireAuth()
);
