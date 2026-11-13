export type AuthorizationClient = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }>;
};
export async function requireAdministrator(client: AuthorizationClient): Promise<void> {
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) throw new Error('Administrator sign-in required.');
  const role = await client.rpc('is_report_admin');
  if (role.error || role.data !== true) throw new Error('This account is not authorized, or its session expired.');
}
