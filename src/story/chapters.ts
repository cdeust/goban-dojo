import { decodeMoves, type GameRecord } from '../domain/game.ts';
import { shusakuOpening, type ShusakuOpening } from '../domain/opening.ts';

/**
 * Le récit : huit chapitres de la vie de Hon'inbō Shūsaku.
 *
 * Chaque fait biographique provient des pages citées dans SOURCES ; lorsqu'elles divergent,
 * le texte le dit. Les dates de promotion sont celles, grégoriennes, de la collection de parties.
 * Les parties proviennent du corpus (public/data/games.json) et sont référencées par leur
 * identifiant stable.
 */

export interface Source {
  label: string;
  url: string;
  detail: string;
}

export const SOURCES: Source[] = [
  {
    label: 'Wikipédia (fr) — « Hon’inbō Shūsaku »',
    url: 'https://fr.wikipedia.org/w/index.php?title=Hon%27inb%C5%8D_Sh%C5%ABsaku&oldid=240986053',
    detail: 'révision 240986053 du 3 novembre 2026, licence CC BY-SA 4.0',
  },
  {
    label: 'Wikipedia (en) — “Hon’inbō Shūsaku”',
    url: 'https://en.wikipedia.org/w/index.php?title=Hon%27inb%C5%8D_Sh%C5%ABsaku&oldid=1381490013',
    detail: 'révision 1381490013 du 22 octobre 2026, licence CC BY-SA 4.0',
  },
  {
    label: 'A. E. Brouwer (CWI) — « Games by Shusaku »',
    url: 'https://homepages.cwi.nl/~aeb/go/games/games/Shusaku/',
    detail:
      '470 parties en SGF, dérivées du recueil 本因坊秀策全集, avec dates japonaises et grégoriennes ; archive vérifiée par empreinte SHA-256',
  },
  {
    label: 'Wikipedia (en) — “Shusaku opening”',
    url: 'https://en.wikipedia.org/wiki/Shusaku_opening',
    detail:
      'consultée le 17 novembre 2026, licence CC BY-SA 4.0 — diagramme de l’ouverture et propos sur le kosumi, que la page rapporte d’après Go Seigen',
  },
  {
    label: 'Professional Go Dataset (PGD)',
    url: 'https://github.com/wangjinzhuo/pgd/tree/b1e006b49dc286f8c513953e5caad0901cd2e895',
    detail:
      'J. Wang, W. Wang, R. Wang, W. Gao, AAAI 2017 — lieux et circonstances de 188 parties, commit b1e006b',
  },
];

export interface Featured {
  gameId: string;
  label: string;
}

export interface Chapter {
  id: string;
  kanji: string;
  reading: string;
  title: string;
  /** Années couvertes, bornes incluses. */
  from: number;
  to: number;
  paragraphs: string[];
  featured: Featured[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'enfance',
    kanji: '虎次郎',
    reading: 'Torajirō',
    title: 'L’enfant d’Innoshima',
    from: 1829,
    to: 1839,
    paragraphs: [
      'Le 6 juin 1829 naît sur l’île d’Innoshima, près d’Onomichi, le second fils du marchand Kuwabara Wazō. On l’appelle Torajirō.',
      'Le seigneur Asano, du château de Mihara, joue contre l’enfant, devient son protecteur et le confie à son propre maître de go, le prêtre Hōshin.',
      'En 1837, à huit ans, il quitte les siens pour Edo et entre à l’école Hon’inbō, la première maison de go du Japon, comme disciple de Hon’inbō Jōwa. On prête à Jōwa ce mot, peut-être apocryphe : le plus grand génie du go depuis cent cinquante ans.',
      'Les deux plus anciennes parties qui nous soient parvenues datent de décembre 1839. Il a dix ans, il porte encore le nom de Yasuda Eisai, et il recevra son diplôme de premier dan quelques jours plus tard, le 3 janvier 1840.',
    ],
    featured: [
      { gameId: 's001', label: 'La plus ancienne partie connue (14 décembre 1839)' },
      { gameId: 's002', label: 'Dix jours plus tard, contre Hori Risaburō' },
    ],
  },
  {
    id: 'ascension',
    kanji: '秀策',
    reading: 'Shūsaku',
    title: 'Le nom de Shūsaku',
    from: 1840,
    to: 1845,
    paragraphs: [
      'En 1840, le jeune premier dan rentre plus d’un an dans son pays natal. De retour à Edo en 1841, il quitte le nom d’Eisai pour celui de Yasuda Shūsaku.',
      'Les grades s’enchaînent : deuxième dan en octobre 1841, troisième en août 1842, quatrième en novembre 1843.',
      'C’est dans ces années, face à Kadono Chūzaemon, fils aîné de Jōwa, qu’il éprouve pour la première fois l’ouverture qui portera son nom : trois komoku aux coups 1, 3 et 5, puis le kosumi.',
      'Le corpus garde la trace de cette ouverture dans 68 parties. La première fois, le 24 mai 1843, c’est Kadono qui la joue contre lui ; Shūsaku la reprend à son compte le 18 juillet. Il la jouera 52 fois avec les noirs, pour 42 victoires, 6 défaites et 2 parties nulles.',
      'Du kosumi, la diagonale du septième coup, il aurait dit qu’il ne serait jamais un mauvais coup, quelle que soit l’évolution de la théorie. Le propos est rapporté par Go Seigen.',
      'Au printemps 1840, à dix ans, il reçoit trois pierres de handicap de deux joueurs qui compteront dans sa vie : Itō Matsujirō, sixième dan, et un septième dan que les kifus nomment Tsuchiya Shūwa.',
    ],
    featured: [
      { gameId: 's004', label: 'Trois pierres contre Itō Matsujirō (1840)' },
      { gameId: 's005', label: 'Trois pierres contre Tsuchiya Shūwa (1840)' },
      { gameId: 's011', label: 'Deux pierres contre Hon’inbō Jōsaku (1841)' },
      { gameId: 's052', label: 'Face à Kadono Chūzaemon (1843)' },
      { gameId: 's084', label: 'Jigo contre Shūwa (1844)' },
    ],
  },
  {
    id: 'oreille-rouge',
    kanji: '耳赤',
    reading: 'Mimiaka',
    title: 'La partie de l’oreille rouge',
    from: 1846,
    to: 1846,
    paragraphs: [
      'En 1846, sur la route qui le ramène à Edo, Shūsaku s’arrête à Osaka et y rencontre Gennan Inseki, huitième dan, champion de la maison Inoue et l’un des plus forts joueurs de son temps.',
      'Une première partie à deux pierres est interrompue : Gennan juge le jeune homme trop fort pour ce handicap. On recommence, Shūsaku prenant simplement les noirs.',
      'La partie débute le 11 septembre et se joue en trois séances. Gennan sort une variation nouvelle du taisha ; Shūsaku se trompe et se retrouve en difficulté. Tous les spectateurs donnent Gennan gagnant — sauf un médecin, qui a vu ses oreilles rougir après un coup de Shūsaku.',
      'Ce coup est le 127ᵉ. Shūsaku l’emporte de deux points au terme de 325 coups.',
    ],
    featured: [
      { gameId: 's125', label: 'La partie à deux pierres, interrompue' },
      { gameId: 's126', label: 'La partie de l’oreille rouge' },
      { gameId: 's128', label: 'Gennan, encore (19 septembre)' },
    ],
  },
  {
    id: 'heritier',
    kanji: '跡目',
    reading: 'Atome',
    title: 'L’héritier des Hon’inbō',
    from: 1847,
    to: 1848,
    paragraphs: [
      'La maison Hon’inbō veut faire de lui son héritier. Shūsaku refuse d’abord, par loyauté envers le seigneur Asano : devenir chef d’une maison de go, c’est entrer au service du shogun.',
      'Après de longues négociations, le seigneur de Mihara le libère de ses obligations. Shūsaku accepte en 1847 ; en 1848 il devient officiellement l’héritier de la maison, sixième dan, et épouse Hana, la fille de Jōwa.',
      'Jōsaku et Jōwa meurent en 1847. Son maître est désormais Shūwa. Par respect, Shūsaku refusera toujours de prendre les blancs contre lui : dans toutes leurs parties en tête-à-tête, il joue noir.',
    ],
    featured: [
      { gameId: 's152', label: 'Deux pierres contre Jōwa, 9ᵉ dan (1847)' },
      { gameId: 's170', label: 'Contre Shūwa, 326 coups (1847)' },
      { gameId: 's177', label: 'Contre Shūwa chez le seigneur Kugai (1847)' },
    ],
  },
  {
    id: 'chateau',
    kanji: '御城碁',
    reading: 'Oshirogo',
    title: 'Les parties du château',
    from: 1849,
    to: 1852,
    paragraphs: [
      'Chaque année, les maisons de go s’affrontent au château d’Edo, devant le shogun : ce sont les oshirogo. Shūsaku y paraît pour la première fois en 1849.',
      'Il n’y perdra jamais. De 1849 à 1861, dix-neuf parties, dix-neuf victoires : le corpus les contient toutes.',
      'En 1851, il dispute aussi une série de vingt parties contre Sekiyama Sendayū, joueur étranger aux grandes maisons.',
    ],
    featured: [
      { gameId: 's246', label: 'Premier oshirogo, contre Sakaguchi Sentoku (1849)' },
      { gameId: 's245', label: 'Oshirogo contre Yasui Sanchi (1849)' },
      { gameId: 's264', label: 'Retour à Onomichi : deux pierres au prêtre Hōshin (1850)' },
      { gameId: 's271', label: 'Shūwa l’emporte d’un point (1851)' },
    ],
  },
  {
    id: 'sanjubango',
    kanji: '三十番碁',
    reading: 'Sanjūbango',
    title: 'Trente parties contre Ōta Yūzō',
    from: 1853,
    to: 1853,
    paragraphs: [
      'En 1853, on dit Shūsaku le plus fort joueur du temps. Ōta Yūzō, quarante-six ans, septième dan, son rival et ami, n’en convient pas. Le mécène Akai Gorosaku finance alors un match sans précédent : trente parties.',
      'Yūzō tient bon jusqu’à la onzième partie, puis Shūsaku se détache : après la dix-septième, il mène de quatre victoires.',
      'La vingt-troisième partie dure près de vingt-quatre heures et s’achève sur un jigo, une partie nulle, que Yūzō obtient avec les blancs. L’honneur est sauf ; le match s’arrête là. Les vingt-trois parties jouées sont toutes ici.',
    ],
    featured: [
      { gameId: 's327', label: 'Première partie du match' },
      { gameId: 's356', label: 'La vingt-troisième : le jigo' },
    ],
  },
  {
    id: 'invincible',
    kanji: '無敵',
    reading: 'Muteki',
    title: 'Shūsaku l’invincible',
    from: 1854,
    to: 1861,
    paragraphs: [
      'Septième dan, héritier des Hon’inbō, Shūsaku passe pour le plus fort joueur du Japon après son maître. Interrogé sur l’issue d’une partie, il aurait répondu simplement : « J’avais les noirs. »',
      'Les oshirogo se poursuivent — sauf en 1855, année du séisme. En 1861 il joue ses deux dernières parties au château, et dispute un match en dix parties contre Murase Shūho, autre grand disciple de Shūwa.',
      'En décembre 1861, contre Hayashi Yūbi, il joue sa dix-neuvième et dernière partie au château.',
    ],
    featured: [
      { gameId: 's376', label: 'Retrouvailles avec Gennan Inseki (1855)' },
      { gameId: 's458', label: 'Jūbango contre Murase Shūho (1861)' },
      { gameId: 's468', label: 'Oshirogo contre Hayashi Monnyū (1861)' },
      { gameId: 's469', label: 'La dernière partie du château (1861)' },
    ],
  },
  {
    id: 'kisei',
    kanji: '棋聖',
    reading: 'Kisei',
    title: 'Le saint du go',
    from: 1862,
    to: 1862,
    paragraphs: [
      'En mars 1862, sa mère meurt. Le 19 juin, il s’assied face à Narabayashi Kurakichi : trente-huit coups, puis le kifu s’arrête. La partie est restée inachevée ; c’est la dernière que l’on connaisse de lui.',
      'À l’été, une épidémie de choléra ravage Edo et frappe la maison Hon’inbō.',
      'Malgré les mises en garde de Shūwa, Shūsaku se dévoue au chevet des malades. Il est contaminé à son tour et s’éteint le 3 septembre 1862. Il avait trente-trois ans.',
      'La postérité l’a élevé au rang de kisei, « saint du go », aux côtés de Dōsaku. Son ouverture a dominé le jeu jusqu’aux années 1930.',
    ],
    featured: [
      { gameId: 's470', label: 'Trois pierres données à Mukai Shōsō (20 mars 1862)' },
      { gameId: 's471', label: 'La dernière partie, inachevée (19 juin 1862)' },
    ],
  },
];

/** Instants remarquables d'une partie, affichés quand la relecture les atteint. */
export interface Moment {
  gameId: string;
  move: number;
  title: string;
  text: string;
}

/** Légendes écrites à la main, d'après les sources du récit. */
export const MOMENTS: Moment[] = [
  {
    gameId: 's125',
    move: 102,
    title: 'La partie s’arrête',
    text: 'Gennan interrompt la partie : deux pierres, c’est trop pour ce jeune homme. On recommencera, Shūsaku prenant simplement les noirs.',
  },
  {
    gameId: 's126',
    move: 89,
    title: 'Fin de la première séance',
    text: 'La partie est interrompue ici, chez Tsuji Chūjirō. Elle reprendra chez Hara Saiichirō.',
  },
  {
    gameId: 's126',
    move: 127,
    title: 'Le coup de l’oreille rouge',
    text: 'Noir 127. Un seul coup pour quatre desseins : agrandir le haut, neutraliser l’influence blanche à droite, soutenir ses pierres fragiles en bas, préparer l’invasion à gauche. Les oreilles de Gennan rougissent.',
  },
  {
    gameId: 's126',
    move: 141,
    title: 'Fin de la deuxième séance',
    text: 'La partie s’achèvera lors d’une réunion organisée par Nakagawa Junsetsu.',
  },
  {
    gameId: 's356',
    move: 273,
    title: 'Jigo',
    text: 'Près de vingt-quatre heures de jeu, et aucun vainqueur. Avec les blancs, Yūzō obtient la nulle ; le match s’arrête sur cette vingt-troisième partie.',
  },
  {
    gameId: 's471',
    move: 38,
    title: 'Le kifu s’arrête ici',
    text: 'Trente-huit coups, le 19 juin 1862. C’est la dernière partie que l’on connaisse de lui ; il meurt le 3 septembre.',
  },
];

const openings = new WeakMap<GameRecord, ShusakuOpening>();

/** L'ouverture de Shūsaku dans cette partie, si elle y est jouée. */
export function openingOf(game: GameRecord): ShusakuOpening {
  let opening = openings.get(game);
  if (!opening) {
    opening = shusakuOpening(decodeMoves(game.moves), game.handicap);
    openings.set(game, opening);
  }
  return opening;
}

/** Légendes tirées du kifu lui-même : l'ouverture de Shūsaku, quand elle est jouée. */
function readMoment(game: GameRecord, move: number): Moment | undefined {
  const opening = openingOf(game);
  if (!opening.fuseki) return undefined;
  const his = game.shusaku === 'B';
  if (move === 5) {
    return {
      gameId: game.id,
      move,
      title: 'L’ouverture de Shūsaku',
      text: his
        ? 'Trois komoku dans trois coins, aux coups 1, 3 et 5.'
        : `Trois komoku dans trois coins, aux coups 1, 3 et 5 : ici, c’est ${game.black} qui la joue contre lui.`,
    };
  }
  if (move === opening.kosumi) {
    return {
      gameId: game.id,
      move,
      title: 'Le kosumi',
      text: 'Blanc approche le coin ; Noir répond par la diagonale.',
    };
  }
  return undefined;
}

export function momentFor(game: GameRecord, move: number): Moment | undefined {
  return MOMENTS.find((m) => m.gameId === game.id && m.move === move) ?? readMoment(game, move);
}

const yearOf = (g: GameRecord): number => Number(g.date.slice(0, 4));

/** Chapitre auquel appartient une partie (d'après l'année de son début). */
export function chapterIndexOf(game: GameRecord): number {
  const y = yearOf(game);
  return CHAPTERS.findIndex((c) => y >= c.from && y <= c.to);
}

export function gamesOfChapter(games: GameRecord[], index: number): GameRecord[] {
  return games.filter((g) => chapterIndexOf(g) === index);
}
