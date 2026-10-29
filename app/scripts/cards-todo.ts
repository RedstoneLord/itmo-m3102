// Что сделано и что осталось по карточкам: без аргументов — таблица по всем конспектам, с подстрокой пути — подробности по подходящим
// (разделы, по которым нужны карточки, ошибки, предупреждения). `--strict` — код выхода 1, если есть ошибки или непокрытые разделы.
//   npm run cards:todo
//   npm run cards:todo -- Алгоритмы
//   npm run cards:todo -- Лекция_3 --strict
import { checkCardFile } from '../src/features/cards/check';
import { checkEntry, loadNotes, orphanCardFiles } from './cards-lib';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const filter = args.find((arg) => !arg.startsWith('--'))?.toLowerCase();
const notes = loadNotes();
const picked = filter ? notes.filter((note) => note.path.toLowerCase().includes(filter)) : notes;

const thousands = (chars: number) => `${Math.max(1, Math.round(chars / 1000))} тыс. зн.`;
let failed = false;
let lastSubject = '';

for (const note of picked) {
  const result = checkEntry(note);
  const covered = result ? result.units.length - result.uncovered.length : 0;
  const status = note.twin
    ? 'PDF-дубль .md (карточки по .md, этому не нужны)'
    : !result
      ? 'карточек нет'
      : `карточек ${result.cards.length}, покрыто ${covered}/${result.units.length}${result.errors.length ? `, ОШИБОК ${result.errors.length}` : ''}`;
  if (note.subject !== lastSubject) {
    console.log(`\n${note.subject}`);
    lastSubject = note.subject;
  }
  console.log(`  ${note.path.split('/').slice(2).join('/')}  [${note.kind}, ${thousands(note.chars)}]  ${status}`);
  if (filter && !note.twin) {
    if (!result) {
      // Нет файла: показываем, куда его класть и по каким разделам нужны карточки (их текст — в src)
      console.log(`      файл карточек: ${note.cardsPath}`);
      const { units } = checkCardFile('', note.source);
      console.log(`      разделы, по которым нужны карточки (${units.length}), src — заголовок как есть:`);
      for (const unit of units) console.log(`        - ${unit}`);
    } else {
      for (const error of result.errors) console.log(`      ОШИБКА: ${error}`);
      for (const unit of result.uncovered) console.log(`      нет карточек: ${unit}`);
      for (const warning of result.warnings) console.log(`      внимание: ${warning}`);
    }
  }
  if (!note.twin && result && (result.errors.length || result.uncovered.length)) failed = true;
}

if (!filter) {
  const todo = notes.filter((note) => !note.twin && note.cardsText === undefined);
  console.log(`\nВсего конспектов: ${notes.filter((note) => !note.twin).length}, без карточек: ${todo.length}`);
}
for (const path of orphanCardFiles(notes)) {
  console.log(`ФАЙЛ БЕЗ КОНСПЕКТА: ${path}`);
  failed = true;
}
if (strict && failed) process.exit(1);
