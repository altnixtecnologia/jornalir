/** Proteção adicional contra vazamento/acesso de banco privilegiado nos
 * deployments da Vercel que não são Production.
 *
 * Mesmo que uma variável de Preview receba acidentalmente uma service_role
 * real no futuro, Admin API não deve utilizá-la. Reabilitar ambientes de
 * homologação exige arquitetura de credenciais revisada separadamente.
 *
 * Não confundir com VERCEL_TARGET_ENV: o único target com uso permitido
 * nesta primeira publicação é VERCEL_ENV=production (ou dev local sem
 * sinalizador da plataforma, para testes controlados).
 */
export function canUseSupabaseAdminCredentials(
  vercelEnv: string | undefined,
): boolean {
  return !vercelEnv || vercelEnv === "production";
}
