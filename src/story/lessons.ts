import type { Practice } from '../domain/practice.ts';

/** Positions vérifiées dans le corpus ; les explications portent sur les règles, pas sur un verdict IA. */
export interface Lesson {
  id: string;
  gameId: string;
  before: number;
  theme: LessonTheme;
  difficulty: 1 | 2;
  title: string;
  prompt: string;
  solution: string;
  comparison: string;
}

export type LessonTheme = 'capture' | 'connection';

export const LESSON_THEMES: Record<LessonTheme, string> = {
  capture: 'Libertés et capture',
  connection: 'Connexion et sauvetage',
};

export const FIRST_LESSON: Lesson = {
  id: 'derniere-liberte',
  gameId: 's001',
  before: 83,
  theme: 'capture',
  difficulty: 1,
  title: 'La dernière liberté',
  prompt:
    'Repérez la pierre noire en P13. Une liberté est une intersection vide au contact direct, jamais en diagonale. Quelle est sa dernière liberté ? Jouez Blanc.',
  solution:
    'O13 était la dernière intersection libre au contact de P13. Blanc l’occupe et la pierre noire est retirée. Ce coup illustre la capture ; il n’est pas forcément le meilleur choix pour toute la partie.',
  comparison:
    'Comparez le coup historique à une autre suite. La capture en P13 se vérifie sur le goban ; un écart en points est une estimation de KataGo après une réponse possible, pas une preuve ni une note de votre niveau.',
};

export const LESSONS: readonly Lesson[] = [
  FIRST_LESSON,
  {
    id: 'relier-pour-sauver',
    gameId: 's001',
    before: 80,
    theme: 'connection',
    difficulty: 1,
    title: 'Relier pour sauver',
    prompt:
      'Noir possède deux pierres en Q14 et Q15 qui n’ont plus qu’une liberté. Reliez-les aux pierres noires de R16 et S16 pour les sauver. Jouez Noir.',
    solution:
      'Q16 relie les pierres Q14–Q15 aux pierres R16–S16. Le groupe réuni possède six libertés au lieu d’une. Une connexion peut transformer une faiblesse en force.',
    comparison:
      'Les six libertés se vérifient sur le goban. Comparez une autre suite pour mesurer les conséquences possibles, sans confondre une estimation avec une preuve.',
  },
  {
    id: 'capturer-un-groupe',
    gameId: 's009',
    before: 31,
    theme: 'capture',
    difficulty: 2,
    title: 'Capturer un groupe',
    prompt:
      'Les trois pierres blanches en Q5, R5 et R4 forment un seul groupe. Trouvez sa dernière liberté commune. Jouez Noir.',
    solution:
      'S4 retire les trois pierres blanches. On compte les libertés du groupe entier, et non celles de chaque pierre séparément.',
    comparison:
      'La capture de trois pierres est certaine ; sa valeur stratégique reste à comparer aux autres coups de la position.',
  },
  {
    id: 'reunir-trois-groupes',
    gameId: 's002',
    before: 21,
    theme: 'connection',
    difficulty: 2,
    title: 'Réunir trois groupes',
    prompt:
      'La pierre blanche C13 est en atari. Deux autres pierres blanches se trouvent en B12 et B14. Trouvez le coup qui relie les trois groupes. Jouez Blanc.',
    solution:
      'B13 sauve C13 et réunit également B12 et B14 dans un seul groupe de cinq libertés. Cherchez les connexions entre plusieurs groupes avant de répondre localement.',
    comparison:
      'Le nouveau groupe et ses cinq libertés sont vérifiables. Comparez les suites sans prendre le score estimé pour un jugement absolu.',
  },
];

export function lessonCard(lesson: Lesson, practice: Practice) {
  return practice.cards.find(
    ({ gameId, before }) => gameId === lesson.gameId && before === lesson.before,
  );
}

/** Priorité aux rappels dus, puis aux exercices nouveaux du niveau le plus accessible. */
export function recommendedLesson(practice: Practice, today: number): Lesson | undefined {
  const pending = LESSONS.map((lesson) => ({ lesson, card: lessonCard(lesson, practice) }))
    .filter(({ card }) => card && card.due <= today)
    .sort((a, b) => a.card!.due - b.card!.due || a.card!.stage - b.card!.stage);
  return pending[0]?.lesson ?? LESSONS.find((lesson) => !lessonCard(lesson, practice));
}
