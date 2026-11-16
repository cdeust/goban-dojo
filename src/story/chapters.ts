import type { GameRecord } from '../domain/game.ts';

/**
 * Le récit : huit chapitres de la vie de Hon'inbō Shūsaku.
 *
 * Chaque fait biographique provient des deux articles cités dans SOURCES ;
 * lorsque les deux divergent, le texte le dit. Les parties proviennent du corpus
 * (public/data/games.json) et sont référencées par leur identifiant stable.
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
    label: 'Professional Go Dataset (PGD)',
    url: 'https://github.com/wangjinzhuo/pgd/tree/b1e006b49dc286f8c513953e5caad0901cd2e895',
    detail:
      'J. Wang, W. Wang, R. Wang, W. Gao, AAAI 2017 — 460 fichiers SGF mentionnant Shūsaku, épinglés au commit b1e006b',
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
      'Le 3 janvier 1840, il reçoit son diplôme de premier dan. Aucune partie de ces années d’apprentissage ne figure dans le corpus : le goban reste vide.',
    ],
    featured: [],
  },
  {
    id: 'ascension',
    kanji: '秀策',
    reading: 'Shūsaku',
    title: 'Le nom de Shūsaku',
    from: 1840,
    to: 1845,
    paragraphs: [
      'En 1840, le jeune premier dan rentre plus d’un an dans son pays natal. De retour à Edo en 1841, il prend le nom de Yasuda Shūsaku.',
      'Les grades s’enchaînent : deuxième dan en 1841, troisième en 1842, quatrième en 1843 ou 1844 selon les sources.',
      'C’est dans ces années, face à Kadono Chūzaemon, fils aîné de Jōwa, qu’il éprouve pour la première fois l’ouverture qui portera son nom : trois komoku aux coups 1, 3 et 5, puis le kosumi.',
      'La plus ancienne partie conservée ici date du 22 avril 1840 : il a dix ans et reçoit trois pierres de handicap d’un septième dan que le kifu nomme Tsuchiya Shūwa.',
    ],
    featured: [
      { gameId: 'c6796bf5b0', label: 'La plus ancienne partie conservée (1840)' },
      { gameId: '7ab747f441', label: 'Deux pierres contre Hon’inbō Jōsaku (1841)' },
      { gameId: '3fcb845c94', label: 'Face à Kadono Chūzaemon (1843)' },
      { gameId: '7084fc2fab', label: 'Jigo contre Shūwa (1844)' },
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
      { gameId: '60d1953ecc', label: 'La partie à deux pierres, interrompue' },
      { gameId: '2d229bca26', label: 'La partie de l’oreille rouge' },
      { gameId: 'e4cd65e800', label: 'Gennan, encore (19 septembre)' },
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
      'Jōsaku et Jōwa meurent en 1847. Son maître est désormais Shūwa. Par respect, Shūsaku refusera toujours de prendre les blancs contre lui : toutes leurs parties le voient jouer noir.',
    ],
    featured: [
      { gameId: 'f9a7b77e68', label: 'Deux pierres contre Jōwa, 9ᵉ dan (1847)' },
      { gameId: '9fec728780', label: 'Contre Shūwa, 326 coups (1847)' },
      { gameId: 'e0a34712b3', label: 'Contre Shūwa chez le seigneur Kugai (1847)' },
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
      { gameId: '4d0c3c49e4', label: 'Premier oshirogo, contre Sakaguchi Sentoku (1849)' },
      { gameId: '2e875e2482', label: 'Oshirogo contre Yasui Sanchi (1849)' },
      { gameId: '30c192a73e', label: 'Retour à Onomichi : deux pierres au prêtre Hōshin (1850)' },
      { gameId: '3b34bf252f', label: 'Shūwa l’emporte d’un point (1851)' },
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
      { gameId: '7783937348', label: 'Première partie du match' },
      { gameId: '45463f6b0b', label: 'La vingt-troisième : le jigo' },
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
      'La dernière partie datée du corpus est celle du château, à la fin de 1861, contre Hayashi Yūbi.',
    ],
    featured: [
      { gameId: '6a7399c4cb', label: 'Retrouvailles avec Gennan Inseki (1855)' },
      { gameId: '3c34e54228', label: 'Jūbango contre Murase Shūho (1861)' },
      { gameId: 'fbe3c431a3', label: 'Oshirogo contre Hayashi Monnyū (1861)' },
      { gameId: '2fd1de428f', label: 'La dernière partie du château (1861)' },
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
      'En mars 1862, sa mère meurt. À l’été, une épidémie de choléra ravage Edo et frappe la maison Hon’inbō.',
      'Malgré les mises en garde de Shūwa, Shūsaku se dévoue au chevet des malades. Il est contaminé à son tour et s’éteint le 3 septembre 1862. Il avait trente-trois ans.',
      'La postérité l’a élevé au rang de kisei, « saint du go », aux côtés de Dōsaku. Son ouverture a dominé le jeu jusqu’aux années 1930.',
      'Il n’y a plus de partie à poser. Le goban reste vide.',
    ],
    featured: [{ gameId: '2fd1de428f', label: 'Revoir sa dernière partie connue' }],
  },
];

/** Instants remarquables d'une partie, affichés quand la relecture les atteint. */
export interface Moment {
  gameId: string;
  move: number;
  title: string;
  text: string;
}

export const MOMENTS: Moment[] = [
  {
    gameId: '2d229bca26',
    move: 89,
    title: 'Fin de la première séance',
    text: 'La partie est interrompue ici, chez Tsuji Chūjirō. Elle reprendra chez Hara Saiichirō.',
  },
  {
    gameId: '2d229bca26',
    move: 127,
    title: 'Le coup de l’oreille rouge',
    text: 'Noir 127. Un seul coup pour quatre desseins : agrandir le haut, neutraliser l’influence blanche à droite, soutenir ses pierres fragiles en bas, préparer l’invasion à gauche. Les oreilles de Gennan rougissent.',
  },
  {
    gameId: '2d229bca26',
    move: 141,
    title: 'Fin de la deuxième séance',
    text: 'La partie s’achèvera lors d’une réunion organisée par Nakagawa Junsetsu.',
  },
];

export function momentFor(gameId: string, move: number): Moment | undefined {
  return MOMENTS.find((m) => m.gameId === gameId && m.move === move);
}

const yearOf = (g: GameRecord): number => Number(g.date.slice(0, 4));

/** Chapitre auquel appartient une partie ; -1 si sa date est douteuse. */
export function chapterIndexOf(game: GameRecord): number {
  if (game.dateSuspect) return -1;
  const y = yearOf(game);
  return CHAPTERS.findIndex((c) => y >= c.from && y <= c.to);
}

export function gamesOfChapter(games: GameRecord[], index: number): GameRecord[] {
  return games.filter((g) => chapterIndexOf(g) === index);
}
