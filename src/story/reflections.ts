import { decodeMoves, type GameRecord } from '../domain/game.ts';

export interface ReflectionLine {
  title: string;
  /** Triplets du kifu pour une variante pédagogique, absent pour la suite réellement jouée. */
  variation?: string;
  notes: readonly string[];
}

interface Reflection {
  after: number;
  title: string;
  context: string;
  question: string;
  sessionBreak?: true;
  lines: readonly ReflectionLine[];
}

export const REFLECTION_SOURCE = 'https://www.smartgo.com/pdf/ear_reddening_game.pdf';

const EAR_RED: readonly Reflection[] = [
  {
    after: 89,
    title: 'Première interruption',
    context: 'La séance du 11 septembre se termine après Noir 89. La partie reprend le 14.',
    question:
      'Gennan peut contenir l’invasion dans le haut ou renforcer son bord. Où Shūsaku obtiendra-t-il de l’espace ?',
    sessionBreak: true,
    lines: [
      {
        title: 'Suite du kifu',
        notes: [
          'Gennan descend en M17, une ligne sous les pierres blanches du bord.',
          'Shūsaku s’étend en M16, vers le centre.',
          'Gennan joue N17 et prolonge sa chaîne depuis M17.',
        ],
      },
      {
        title: 'Blanc couvre le bord',
        variation: 'wmablbwlc',
        notes: [
          'N19 prolonge la chaîne blanche du bord supérieur.',
          'Shūsaku peut occuper M18, au contact de la chaîne blanche du haut.',
          'Gennan peut jouer au contact en M17. Comparez l’ordre des coups à celui du kifu.',
        ],
      },
    ],
  },
  {
    after: 126,
    title: 'Le coup de l’oreille rouge',
    context:
      'Miyamoto Naoki analyse Noir 127 comme un tournant entre attaque et défense. Le temps pris pour le jouer est inconnu.',
    question:
      'Shūsaku peut prendre une pierre dans le bas ou agir au centre. Dans les deux cas, où Gennan peut-il reprendre l’initiative ?',
    lines: [
      {
        title: 'Suite du kifu',
        notes: [
          'K11 répond au coup blanc précédent depuis le centre. Il soutient les Noirs du bas et agit sur les zones d’influence des deux camps.',
          'Gennan joue E18, sur le bord supérieur, au contact de Noir D18.',
          'Shūsaku joue F18, de l’autre côté de cette pierre blanche.',
        ],
      },
      {
        title: 'Noir capture dans le bas',
        variation: 'bgpwebbfb',
        notes: [
          'G4 prend la pierre blanche de G3 et relie les pierres noires de G5 et H4. Le centre reste ouvert.',
          'Gennan conserve la possibilité de jouer E18 dans le haut.',
          'F18 répond localement. Comparez ce que Noir a gagné dans le bas à ce que K11 faisait au centre.',
        ],
      },
      {
        title: 'Blanc joue au bord',
        variation: 'bjiwdabeb',
        notes: [
          'Shūsaku joue K11 comme dans la partie.',
          'D19 touche Noir D18 par le bord et lui enlève une liberté.',
          'E18 donne de l’espace à la pierre noire de D18. Comparez le groupe ainsi relié à la suite historique.',
        ],
      },
    ],
  },
  {
    after: 141,
    title: 'Deuxième interruption',
    context: 'Noir 141 clôt la séance du 14 septembre. La partie reprend le 15.',
    question:
      'Gennan peut ouvrir une bataille en bas à gauche ou prendre la pierre de P12 à droite. Où Shūsaku peut-il relier ses groupes ?',
    sessionBreak: true,
    lines: [
      {
        title: 'Suite du kifu',
        notes: [
          'Gennan entre en E2, dans le bas gauche, près des pierres noires F3 et G2.',
          'Shūsaku répond en D7 et porte le combat plus haut sur le côté gauche.',
          'Gennan joue F6, vers le centre, plutôt que de prolonger immédiatement son action en E2.',
        ],
      },
      {
        title: 'Blanc attaque à droite',
        variation: 'wnhbpjwsf',
        notes: [
          'O12 prend Noir P12 et relie les pierres blanches de O11 et O13.',
          'Q10 relie la pierre noire P10 à ses voisines et l’éloigne du danger immédiat.',
          'T14 met la chaîne noire du bord droit en atari. Il ne lui reste que T11 comme liberté.',
        ],
      },
    ],
  },
];

export function reflectionsOf(game: GameRecord): readonly Reflection[] {
  return game.id === 's126' ? EAR_RED : [];
}

export function reflectionMoves(game: GameRecord, after: number, line: ReflectionLine) {
  return line.variation
    ? decodeMoves(line.variation)
    : decodeMoves(game.moves.slice(after * 3, (after + line.notes.length) * 3));
}
