// The admin dashboard keeps its Supabase session in its own cookie.
//
// By default @supabase/ssr names the cookie after the project ref, so the admin
// dashboard and the member portal shared one cookie on
// this domain. Signing into any of them as a different account overwrote the
// others — which is why an admin session kept disappearing after using the
// member portal, with no way back in except another magic link.
//
// Every place that reads or writes the admin session must pass this as
// cookieOptions.name; @supabase/ssr uses it as the auth storage key too.
export const ADMIN_COOKIE_NAME = 'sb-rcceb-admin-auth';
