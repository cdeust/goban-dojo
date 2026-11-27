/** Positions vérifiées dans le corpus ; les explications portent sur les règles, pas sur un verdict IA. */
export interface Lesson {
  id: string;
  gameId: string;
  before: number;
  title: string;
  prompt: string;
  solution: string;
  comparison: string;
}

export const FIRST_LESSON: Lesson = {
  id: 'derniere-liberte',
  gameId: 's001',
  before: 83,
  title: 'La dernière liberté',
  prompt:
    'Repérez la pierre noire en P13. Une liberté est une intersection vide au contact direct, jamais en diagonale. Quelle est sa dernière liberté ? Jouez Blanc.',
  solution:
    'O13 était la dernière intersection libre au contact de P13. Blanc l’occupe et la pierre noire est retirée. Ce coup illustre la capture ; il n’est pas forcément le meilleur choix pour toute la partie.',
  comparison:
    'Comparez le coup historique à une autre suite. La capture en P13 se vérifie sur le goban ; un écart en points est une estimation de KataGo après une réponse possible, pas une preuve ni une note de votre niveau.',
};
