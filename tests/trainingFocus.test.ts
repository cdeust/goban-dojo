import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { pointFromHuman, POINTS } from '../src/domain/board.ts';
import { decodeMoves, type Dataset } from '../src/domain/game.ts';
import {
  newTrainingGame,
  trainingPosition,
  type TrainingGame,
} from '../src/domain/trainingGame.ts';
import { trainingFocus } from '../src/domain/trainingFocus.ts';

const data = JSON.parse(
  readFileSync(new URL('../public/data/games.json', import.meta.url), 'utf8'),
) as Dataset;
describe('Relier les erreurs de partie aux exercices réels', () => {
  it('propose une capture lorsqu’un candidat capture et que le coup réellement choisi ne le fait pas', () => {
    const source = data.games.find((g) => g.id === 's001')!;
    const prefix = decodeMoves(source.moves).slice(0, 83);
    const { board } = trainingPosition(prefix);
    const alternative = Array.from({ length: POINTS }, (_, p) => p).find((p) => {
      const value = board.clone().play('W', p);
      return !value.illegal && !value.captures.length;
    })!;
    const game: TrainingGame = {
      ...newTrainingGame('W', 'test'),
      moves: [...prefix, { color: 'W', point: alternative }],
    };
    expect(trainingFocus(game, 84, pointFromHuman('O13')!)).toMatchObject({
      module: 'capture-one',
    });
    expect(trainingFocus(game, 84, -2)).toBeUndefined();
  });
  it('préconise le fuseki comme entraînement, sans inventer une cause de perte', () => {
    const point = pointFromHuman('D4')!;
    const game: TrainingGame = { ...newTrainingGame('B', 'test'), moves: [{ color: 'B', point }] };
    expect(trainingFocus(game, 1, point)?.module).toBe('fuseki');
    expect(trainingFocus(game, 1, point)?.reason).toContain('sans identifier');
  });
});
