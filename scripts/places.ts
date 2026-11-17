/**
 * Traduction en français des lieux des parties. Les sources (collection CWI, PGD) les donnent en
 * anglais, dans une centaine de formulations ; les noms propres sont laissés dans leur
 * transcription d'origine.
 *
 * Les tournures courantes sont traduites par règles, segment par segment ; les phrases
 * composées (plusieurs séances, remarques des éditeurs) le sont une à une dans `PHRASES`.
 */

/** Phrases traduites à la main : la clé est le texte source exact. */
const PHRASES: Record<string, string> = {
  'Day 1 at Edo Castle then at residence of Commissioner for Shrines and Temples, Lord Wakisaka Yasunari of Awaji':
    'Première séance au château d’Edo, puis à la résidence du commissaire aux sanctuaires et aux temples, le seigneur Wakisaka Yasunari d’Awaji',
  'Day 1 {to move 89}, residence of Tsuji Chujiro, Tennoji-ya, Naniwa, then residence of Hara Saichiro {to move 141} and then meeting organised by Nakagawa Junsetsu at Nakanoshima Kamiya Inn':
    'Première séance (jusqu’au coup 89) à la résidence de Tsuji Chujiro, Tennoji-ya, Naniwa ; puis à la résidence de Hara Saichiro (jusqu’au coup 141) ; puis lors d’une réunion organisée par Nakagawa Junsetsu à l’auberge Kamiya de Nakanoshima',
  'Edo Castle then residence of Lord Matsudaira of Izu':
    'Château d’Edo, puis résidence du seigneur Matsudaira d’Izu',
  'Edo Castle then residence of Lord Wakizaka of Awaji':
    'Château d’Edo, puis résidence du seigneur Wakizaka d’Awaji',
  'Fukujoji Temple, Kawai Village, Iwami Province, on first two days then {and through the night till completion at 9am on 22nd} at the Kajino residence, Shizuma Village':
    'Les deux premiers jours au temple Fukujoji, village de Kawai, province d’Iwami ; puis, toute la nuit et jusqu’à la fin à 9 heures le 22, à la résidence Kajino, village de Shizuma',
  'Go meeting at Rakuya Inn, Yokogawa, Hiroshima':
    'Réunion de go à l’auberge Rakuya, Yokogawa, Hiroshima',
  "Hirakawa Tenjin's Villa, Kojimachi, Edo": 'Villa du Hirakawa Tenjin, Kojimachi, Edo',
  'Hirakawa Tenjin Villa': 'Villa du Hirakawa Tenjin',
  'House of Ito Showa then the Daiji-in': 'Maison d’Ito Showa, puis le Daiji-in',
  'Mansion of Lord Seki of Izumo in Sakai': 'Demeure du seigneur Seki d’Izumo, à Sakai',
  'Nishimaru, Edo Castle': 'Nishimaru (enceinte ouest), château d’Edo',
  'On both occasions at the residence of Lord Kugai of Inaba':
    'Les deux séances à la résidence du seigneur Kugai d’Inaba',
  'Residence of Akai Gorosaku {a hashimoto} near Akasaka Palace Gate':
    'Résidence d’Akai Gorosaku (« a hashimoto », dit la source), près de la porte du palais d’Akasaka',
  'Residence of Lord Ota of Shima, facing Yanagiwara':
    'Résidence du seigneur Ota de Shima, face à Yanagiwara',
  'Shingai-sha Shrine (another source says residence of Edoya Jugoro)':
    'Sanctuaire Shingai-sha (résidence d’Edoya Jugoro selon une autre source)',
  'Tsuruoka Sumo meeting, Seiho Inn, Meishiji, Kanda':
    'Réunion de sumo de Tsuruoka, auberge Seiho, Meishiji, Kanda',
  'Umemoto without Akasaka Gateto move 27, then residence of Lord Atobe of Nodo at Yushima, Hongo {Edo} from 7pm and through the night until 4.30 am':
    'Umemoto, hors la porte d’Akasaka, jusqu’au coup 27 ; puis résidence du seigneur Atobe de Nodo à Yushima, Hongo (Edo), de 19 heures et toute la nuit jusqu’à 4 h 30',
  'Up to move 47 {day 1} at residence of Murayama Minbu, then at the residence of Izumi Koichiro':
    'Jusqu’au coup 47 (première séance) à la résidence de Murayama Minbu, puis à la résidence d’Izumi Koichiro',
  'Sankaku-an (residence of Hirose Kunishiro)': 'Sankaku-an, résidence de Hirose Kunishiro',
};

/** « de X », élidé devant une voyelle. */
const of = (name: string): string => (/^[AEIOU]/.test(name) ? `d’${name}` : `de ${name}`);

/** Traduit un segment (entre deux virgules). */
function segment(text: string): string {
  const t = text.trim();
  let m: RegExpMatchArray | null;
  if (t === 'Edo Castle') return 'château d’Edo';
  if (/^Honinbo house(hold)?$/.test(t)) return 'maison Hon’inbō';
  if ((m = t.match(/^(?:The )?(?:Residence|Res\.) of Lord (.+) of (.+)$/i)))
    return `résidence du seigneur ${m[1]} ${of(m[2] as string)}`;
  if ((m = t.match(/^(?:The )?(?:Residence|Res\.) of (.+)$/i)))
    return `résidence ${of(m[1] as string)}`;
  if ((m = t.match(/^(?:Home|House|Hom eof) (?:of )?(?:Mr )?(.+)$/)))
    return `maison ${of(m[1] as string)}`;
  if ((m = t.match(/^Lord (.+) of (.+)$/))) return `le seigneur ${m[1]} ${of(m[2] as string)}`;
  if ((m = t.match(/^Mansion of (.+)$/))) return `demeure ${of(m[1] as string)}`;
  if ((m = t.match(/^Pavilion of (.+)$/))) return `pavillon ${of(m[1] as string)}`;
  if ((m = t.match(/^(.+)'s (?:home|house)$/))) return `maison ${of(m[1] as string)}`;
  if ((m = t.match(/^(.+) home$/))) return `maison ${m[1]}`;
  if ((m = t.match(/^(.+) residence$/))) return `résidence ${m[1]}`;
  if ((m = t.match(/^(.+) Temple$/))) return `temple ${m[1]}`;
  if ((m = t.match(/^(.+) Inn$/))) return `auberge ${m[1]}`;
  if ((m = t.match(/^(.+) Village$/))) return `village de ${m[1]}`;
  if ((m = t.match(/^(.+) Prov(?:\.|ince)?$/))) return `province ${of(m[1] as string)}`;
  if ((m = t.match(/^The (.+)$/))) return `le ${m[1]}`;
  return t;
}

/** Remarque d'éditeur, entre accolades dans la source. */
function remark(text: string): string {
  const m = text.match(/^probably (.+)$/);
  return m ? `probablement ${segment(m[1] as string)}` : segment(text);
}

/** Traduit un lieu de la source. */
export function translatePlace(source: string): string {
  const exact = PHRASES[source];
  if (exact) return exact;
  let remarks = '';
  const body = source.replace(/\.$/, '').replace(/\s*\{([^}]*)\}/g, (_, inner: string) => {
    remarks += ` (${remark(inner)})`;
    return '';
  });
  const text = body.split(',').map(segment).join(', ') + remarks;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Mots anglais (absents du français) qui ne doivent pas subsister dans un lieu traduit. */
export const UNTRANSLATED =
  /\b(of|the|then|at|and|near|residence|home|house|household|mansion|shrine|inn|castle|day|move|probably|meeting|lord|without|says|facing)\b|Prov\./i;
