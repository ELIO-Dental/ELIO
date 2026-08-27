// Re-export the SEPARATE admin NextAuth instance (packages/auth/admin-config.ts)
// — never the shared `@elio/auth` `auth`/`handlers` used by apps/shell. See
// admin-config.ts's own comment for why these must stay genuinely distinct.
export { adminHandlers as handlers, adminAuth as auth, adminSignIn as signIn, adminSignOut as signOut } from "@elio/auth";
