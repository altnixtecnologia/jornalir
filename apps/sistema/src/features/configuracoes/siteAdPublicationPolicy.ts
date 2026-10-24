/** Patrocinadores do portal são bônus gratuitos, SEM financeiro ou cliente.
 * Exibição depende apenas da seleção manual pelo operador autorizado.
 */
export interface SiteAdPublicationInput { active: boolean }
export function validateSiteAdPublication(input:SiteAdPublicationInput):SiteAdPublicationInput{
 if(typeof input?.active!=="boolean")throw new Error("Situação do patrocinador inválida.");
 return {active:input.active};
}
export function publicationStatus(input:SiteAdPublicationInput):"active"|"suspended"{
 return input.active?"active":"suspended";
}
