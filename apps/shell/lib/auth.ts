// Re-export the shared @elio/auth NextAuth instance for use inside apps/shell
// (route handlers, server components, middleware).
export { handlers, auth, signIn, signOut } from "@elio/auth";
