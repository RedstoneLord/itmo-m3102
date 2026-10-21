import { describe, expect, it } from 'vitest';
import { rewardText } from './useQuizRewards';

describe('награда за тест', () => {
  it('из HTML итога остаётся только текст', () => {
    expect(rewardText('<div class="quiz-result-sub">+9 🍓 за верные ответы с первой попытки</div>')).toBe('+9 🍓 за верные ответы с первой попытки');
    expect(rewardText('<div class="quiz-result-sub">Дневной лимит наград за тесты исчерпан.</div>')).toBe('Дневной лимит наград за тесты исчерпан.');
  });
});
