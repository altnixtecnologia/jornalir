/**
 * Estado IMUTÁVEL da primeira publicação Jornal IR, revisto em 24/10/2026.
 * NFS-e fica para um release POSTERIOR à publicação do site/sistema.
 * Não utilizar variável de ambiente: habilitar exige revisão de código,
 * testes fiscais, homologação e autorização explícita do proprietário.
 *
 * Proteções complementares: menu, middleware e Server Actions.
 */
export const NFSE_AVAILABLE_IN_THIS_RELEASE: boolean = false;
/**
 * Preparacao administrativa no sistema OFICIAL: libera apenas as telas,
 * configuracao, perfis e rascunhos para proprietarios/administradores.
 * NAO permite transmitir NFS-e, cancelar, consultar SEFIN, arquivar PDF
 * definitivo nem disparar e-mails fiscais. Controle separado do release
 * de emissao. Nao configuravel por env/cliente.
 */
export const NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE: boolean = true;

export const NFSE_POSTPONED_MESSAGE = "NFS-e ficará disponível em uma etapa posterior à publicação do Jornal IR.";
