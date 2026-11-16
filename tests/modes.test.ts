import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { pointFromSgf } from '../src/domain/board.ts';
import type { Dataset } from '../src/domain/game.ts';
import {
  HINT_SIZES,
  MAX_VARIATION,
  displayOf,
  hintZone,
  nextColor,
  pointDistance,
  timelineOf,
  useStore,
} from '../src/state/store.ts';

const dataset = JSON.parse(
  readFileSync(join(import.meta.dirname, '../public/data/games.json'), 'utf8'),
) as Dataset;
const P = pointFromSgf;
/** La partie de l'oreille rouge : Shūsaku a les noirs, premiers coups q16 (qd), d17 (dc), q3 (pq)… */
const RED_EAR = dataset.games.findIndex((g) => g.id === '2d229bca26');
const s = () => useStore.getState();

beforeEach(() => {
  useStore.setState({ dataset, status: 'ready', entered: true, mode: 'lecture', playing: false });
  s().selectGame(RED_EAR);
});

describe('hintZone', () => {
  it('contient toujours la cible et reste dans le goban, pour tout point et toute taille', () => {
    for (const size of HINT_SIZES) {
      for (let p = 0; p < 361; p++) {
        const z = hintZone(p, size);
        const x = p % 19;
        const y = Math.floor(p / 19);
        expect(z.x1 - z.x0 + 1).toBe(size);
        expect(z.y1 - z.y0 + 1).toBe(size);
        expect(z.x0 >= 0 && z.y0 >= 0 && z.x1 <= 18 && z.y1 <= 18).toBe(true);
        expect(x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1).toBe(true);
      }
    }
  });

  it('ne place pas systématiquement la cible au centre de la zone', () => {
    let centred = 0;
    for (let p = 0; p < 361; p++) {
      const z = hintZone(p, 9);
      if ((z.x0 + z.x1) / 2 === p % 19 && (z.y0 + z.y1) / 2 === Math.floor(p / 19)) centred++;
    }
    expect(centred).toBeLessThan(40);
  });
});

describe('pointDistance', () => {
  it('mesure la distance de Tchebychev', () => {
    expect(pointDistance(P('dd'), P('dd'))).toBe(0);
    expect(pointDistance(P('dd'), P('ee'))).toBe(1);
    expect(pointDistance(P('aa'), P('ss'))).toBe(18);
    expect(pointDistance(P('dd'), P('dj'))).toBe(6);
  });
});

describe('mode « deviner »', () => {
  beforeEach(() => s().setMode('deviner'));

  it('un coup trouvé du premier essai vaut 3 points et avance la partie', () => {
    s().clickPoint(P('qd'));
    expect(s().move).toBe(1);
    expect(s().guess).toMatchObject({ asked: 1, found: 1, firstTry: 1, points: 3 });
    expect(s().guess.last).toEqual({ kind: 'exact', points: 3 });
  });

  it('un essai manqué donne la distance et une zone, puis la zone se resserre', () => {
    s().clickPoint(P('dd'));
    expect(s().move).toBe(0);
    expect(s().guess.tries).toBe(1);
    expect(s().guess.last).toEqual({ kind: 'miss', distance: 13 });
    expect(s().guess.wrong).toEqual([P('dd')]);
    const first = s().guess.zone;
    expect(first && first.x1 - first.x0 + 1).toBe(9);
    s().clickPoint(P('pp'));
    const second = s().guess.zone;
    expect(second && second.x1 - second.x0 + 1).toBe(5);
    // Trouvé au troisième essai : 1 point.
    s().clickPoint(P('qd'));
    expect(s().guess).toMatchObject({ asked: 1, found: 1, firstTry: 0, points: 1, zone: null });
    expect(s().move).toBe(1);
  });

  it('au troisième essai manqué, le coup est montré et ne rapporte rien', () => {
    for (const c of ['dd', 'pp', 'jj']) s().clickPoint(P(c));
    expect(s().move).toBe(1);
    expect(s().guess).toMatchObject({ asked: 1, found: 0, points: 0, tries: 0 });
    expect(s().guess.last).toEqual({ kind: 'revealed', point: P('qd') });
  });

  it('ignore un clic quand ce n’est pas à Shūsaku de jouer, ou sur une pierre', () => {
    s().clickPoint(P('qd'));
    // Coup 2 : c'est à Blanc (Gennan).
    s().clickPoint(P('dc'));
    expect(s().move).toBe(1);
    expect(s().guess.asked).toBe(1);
    // Retour au coup 3 (Noir) : cliquer sur une pierre existante ne compte pas comme un essai.
    useStore.setState({ move: 2 });
    s().clickPoint(P('qd'));
    expect(s().guess.tries).toBe(0);
  });

  it('un même point faux n’est compté qu’une fois ; un indice coûte un essai', () => {
    s().clickPoint(P('dd'));
    s().clickPoint(P('dd'));
    expect(s().guess.tries).toBe(1);
    s().hint();
    expect(s().guess.tries).toBe(2);
    s().clickPoint(P('qd'));
    expect(s().guess.points).toBe(1);
  });

  it('changer de partie remet le bilan à zéro, se déplacer dans la partie le conserve', () => {
    s().clickPoint(P('qd'));
    s().setMove(10);
    expect(s().guess).toMatchObject({ asked: 1, points: 3, tries: 0 });
    s().selectGame(RED_EAR + 1);
    expect(s().guess).toMatchObject({ asked: 0, points: 0 });
  });
});

describe('mode « explorer »', () => {
  beforeEach(() => {
    s().setMode('explorer');
    s().setMove(2);
  });

  it('ajoute des coups en alternant les couleurs, sans toucher à la partie', () => {
    expect(nextColor(s())).toBe('B');
    s().clickPoint(P('dp'));
    s().clickPoint(P('pp'));
    expect(s().variation).toEqual([
      { color: 'B', point: P('dp') },
      { color: 'W', point: P('pp') },
    ]);
    expect(s().move).toBe(2);
    const d = displayOf(s());
    expect(d?.move).toBe(4);
    expect(d?.timeline.stones).toHaveLength(4);
    // La partie d'origine est intacte.
    expect(timelineOf(dataset.games[RED_EAR]!).moves[2]).toEqual({ color: 'B', point: P('pq') });
  });

  it('refuse un point occupé et explique pourquoi', () => {
    s().clickPoint(P('qd'));
    expect(s().variation).toEqual([]);
    expect(s().notice).toMatch(/occupée/);
  });

  it('applique les captures dans la suite explorée', () => {
    // Autour de la pierre blanche d17 (dc) : Noir joue c17, e17, d16 puis d18 pour la capturer.
    for (const c of ['cc', 'aa', 'ec', 'ab', 'dd', 'ba', 'db']) s().clickPoint(P(c));
    const d = displayOf(s());
    const white = d?.timeline.stones.find((st) => st.point === P('dc'));
    expect(white?.capturedAt).toBe(d?.move);
    // Le point libéré redevient jouable… sauf suicide : Blanc n'y a aucune liberté.
    s().clickPoint(P('dc'));
    expect(s().notice).toMatch(/aucune liberté/);
  });

  it('reprend un coup, puis revient à la partie', () => {
    s().clickPoint(P('dp'));
    s().clickPoint(P('pp'));
    s().undoVariation();
    expect(s().variation).toHaveLength(1);
    expect(nextColor(s())).toBe('W');
    s().clearVariation();
    expect(displayOf(s())?.move).toBe(2);
  });

  it('se déplacer dans la partie abandonne l’exploration ; la lecture ramène au mode lecture', () => {
    s().clickPoint(P('dp'));
    s().setMove(5);
    expect(s().variation).toEqual([]);
    s().clickPoint(P('jj'));
    s().setPlaying(true);
    expect(s()).toMatchObject({ mode: 'lecture', variation: [], playing: true });
  });

  it('plafonne la longueur d’une exploration', () => {
    let n = 0;
    for (let p = 0; p < 361 && n < MAX_VARIATION + 5; p++) {
      const before = s().variation.length;
      s().clickPoint(p);
      if (s().variation.length > before) n++;
      else if (s().notice?.includes('limitée')) break;
    }
    expect(s().variation).toHaveLength(MAX_VARIATION);
    expect(s().notice).toMatch(/limitée à 80 coups/);
  });
});
