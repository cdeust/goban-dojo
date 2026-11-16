/** Provenance épinglée du corpus de parties. */

/**
 * Source principale : « Games by Shusaku », collection d'Andries E. Brouwer (CWI, Amsterdam).
 * 470 parties, dérivées du recueil chinois 本因坊秀策全集 (471 parties), romanisées et corrigées,
 * avec pour chacune la date japonaise et sa conversion grégorienne.
 */
export const CWI = {
  page: 'https://homepages.cwi.nl/~aeb/go/games/games/Shusaku/',
  archive: 'https://homepages.cwi.nl/~aeb/go/games/shusaku.tgz',
  archiveSha256: 'f1579444185cd7f516a433aad35a0cad93bd2c76d302602088448513dcd58650',
} as const;

/**
 * Source complémentaire : Professional Go Dataset. Sert uniquement à reprendre, pour les
 * parties qu'il contient aussi, le lieu et les circonstances que la source principale n'a pas.
 */
export const PGD = {
  repository: 'wangjinzhuo/pgd',
  commit: 'b1e006b49dc286f8c513953e5caad0901cd2e895',
} as const;
