import { useEffect, useMemo, useRef } from 'react';
import type { QuizData } from '../../components/quiz/parseQuiz';

type Rewards = typeof import('../../../../js/rewards.js');

/** Из HTML-строки итога (`<div class="quiz-result-sub">…</div>`) оставляем текст: рисуем его своим элементом */
export const rewardText = (html: string) => html.replace(/<[^>]*>/g, '').trim();

/**
 * Награда за тест (js/rewards.js группы): награждается только первая попытка по каждому вопросу за всё время, ответ быстрее
 * нескольких секунд не считается. Журнал общий с классической версией. Модуль подгружается лениво, при первом открытии теста.
 * Вопросы у группы называются `q`, у нас `question` — отдаём модулю в его виде.
 */
export function useQuizRewards(data: QuizData | undefined, enabled: boolean) {
  const loaded = useRef<Rewards | null>(null);
  const fresh = useRef<unknown[]>([]);
  const questions = useMemo(() => (data?.questions ?? []).map((item) => ({ q: item.question })), [data]);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    void import('../../../../js/rewards.js')
      .then((module) => {
        if (alive) loaded.current = module;
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [enabled]);

  return useMemo(
    () =>
      enabled
        ? {
            /** Ответ на вопрос index проверен; ms — сколько он был на экране */
            onAnswer(index: number, ok: boolean, ms: number) {
              const module = loaded.current;
              const question = questions[index];
              if (!module || !question) return;
              const entry = module.quizReward.attempt(module.quizReward.quizId(questions), question, ok, ms);
              if (entry) fresh.current.push(entry);
            },
            /** Конец прохождения: выплата за первые попытки; строка для экрана итога или null */
            settle(): string | null {
              const list = fresh.current;
              fresh.current = [];
              const result = loaded.current?.quizReward.settle(list);
              return result ? rewardText(result.html) : null;
            },
          }
        : undefined,
    [enabled, questions],
  );
}
