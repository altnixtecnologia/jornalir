# Esquemas XSD oficiais — Produção Restrita (RTC) v1.01-20260727

**Origem**: Portal Nacional da NFS-e (gov.br), seção Biblioteca → Documentação
Técnica → Produção Restrita:
<https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita>

**Arquivo original baixado**: `esquemas-nfse-rtc-v1-01-20260727.zip`
<https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/esquemas-nfse-rtc-v1-01-20260727.zip>

**Versão**: 1.01 — **Data**: 2026-07-27 (RTC — Reforma Tributária do Consumo,
grupos IBS/CBS).

**SHA-256 do ZIP original**:
`6c7e0510d3ecff4454f291f4e10b742d27a4818f23aab181494f96d0ea79f3dc`

**Checksums individuais (SHA-256) dos arquivos extraídos e vendorizados aqui**:

```
26961f705970ccb1dede1b6bb0ab544ca1d089137c22e93371d789c1e15ef0c4  CNC_v1.00.xsd
c7dab363d8cf7c83fc2b3b21e72cf669a51bd30947a5690685ea96c4b3e39dcd  DPS_v1.01.xsd
1dd8f543060a4ba6f355693f1fa5d79a269acae7c3dfe42d621f62911cfebac0  NFSe_v1.01.xsd
dd14062174d439a67a11266d82e822cb9021db1595a41bd876a16560a38f6aec  evento_v1.01.xsd
186c83f33752a195845300af61ffbe7136547f84cab032b35238c78f9d78f7c6  pedRegEvento_v1.01.xsd
c1cc33f1007251075b1fff7766bf881bba6a8ad7f1f36d149e54ae98090c77f8  tiposCnc_v1.00.xsd
6f792f408a33c11e799042a8d61cac7d1c9f5992c53e07e60ce75a15f157d1ac  tiposComplexos_v1.01.xsd
6c9ae744b1cb886607c1138c32eeb76cd410b856ce7301197b95d48d63f7b40b  tiposEventos_v1.01.xsd
3d8171c9b7c9a82ecb48eed9a96485f2077006e7d21db6cd182839dd34dbb5e4  tiposSimples_v1.01.xsd
bf43998b2df1fedd9ed7d6914f91ab4d34958e8730c3b500cbe0b21e60335f11  xmldsig-core-schema.xsd
```

(Pode ser reconferido com `sha256sum *.xsd` dentro desta pasta.)

**IMPORTANTE — nunca misturar com Produção**: este pacote é exclusivo de
Produção Restrita. O pacote de Produção tem nome/versão diferente e NÃO deve
ser usado nem deduzido a partir deste. Ver `NFSE_SCHEMA_PACKAGE_HOMOLOGATION`
em `@ir/types`.

## Achado relevante confirmado nesta revisão (Parte 2B)

`TSIdDPS` (em `tiposSimples_v1.01.xsd`) exige o literal `"DPS"` como prefixo
do atributo `Id` do `infDPS`, totalizando **45 caracteres** (não 42):

```
"DPS" + Cód.Mun(7) + Tipo Insc.(1) + Insc. Federal(14) + Série DPS(5) + Núm. DPS(15)
pattern: DPS[0-9]{7}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{20}
```

Tipo de Inscrição: `1` = CPF (zero-padded à esquerda até 14), `2` = CNPJ
(aceita `[0-9A-Z]{14}` porque o CNPJ alfanumérico da Reforma Tributária pode
conter letras). `buildDpsId`/`buildDpsInfDpsId` foram corrigidos para
produzir exatamente este formato de 45 caracteres com o prefixo `"DPS"`.

`TCDPS` (em `tiposComplexos_v1.01.xsd`) confirma estruturalmente o perfil de
assinatura usado nesta fase: `infDPS` (com atributo `Id` obrigatório) seguido
de `ds:Signature` (padrão xmldsig, `minOccurs="0"` no XSD — mas obrigatório
na prática para transmissão real), dentro do elemento `DPS` — ou seja,
assinatura **enveloped**, referenciando `infDPS` pelo seu `Id`.
