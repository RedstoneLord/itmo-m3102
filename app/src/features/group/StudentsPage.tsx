import { UserCheck } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { GithubMark } from '../../components/ui/GithubMark';
import { PageHeader } from '../../components/ui/PageHeader';
import { TelegramMark } from '../../components/ui/TelegramMark';
import { cn } from '../../lib/cn';
import { M3102_STUDENTS } from '../../data/m3102';
import { REPO_URL } from '../../services/github';
import { useMeStore } from './meStore';
import { useProfileStore } from './profileStore';
import styles from './StudentsPage.module.css';

/** Студенты группы М3102: фото с GitHub, контакты, факт о себе и коммиты; карточка открывает профиль. */
export function StudentsPage() {
  // Профиль — общее окно в AppShell (useProfileStore), не адрес: смена адреса перерисовывает всё приложение,
  // и окно «застывало». ?u=логин в ссылке только открывает профиль — и сразу убирается из адреса
  const [params, setParams] = useSearchParams();
  const openProfile = useProfileStore((state) => state.open);
  const prepareProfile = useProfileStore((state) => state.prepare);
  const me = useMeStore((state) => state.login);
  useEffect(prepareProfile, [prepareProfile]);
  useEffect(() => {
    const login = params.get('u');
    if (!login) return;
    // Сначала чистим адрес, потом открываем: запись профиля в истории должна лечь поверх уже чистого адреса
    setParams({}, { replace: true });
    openProfile(login);
  }, [params, setParams, openProfile]);

  return (
    <>
      <PageHeader
        title="Студенты группы М3102"
        subtitle="Нажмите на карточку — откроется профиль. «Коммиты» — история правок студента в репозитории материалов группы."
      />
      <div className={`${styles.grid} stagger`}>
        {M3102_STUDENTS.map((student) => {
          const github = `https://github.com/${encodeURIComponent(student.github)}`;
          const isMe = student.github === me;
          return (
            <article key={student.github} className={cn(styles.card, isMe && styles.mine)} data-spot>
              <img
                className={styles.photo}
                src={`${github}.png?size=160`}
                alt=""
                loading="lazy"
                onError={(event) => (event.currentTarget.style.visibility = 'hidden')}
              />
              <div className={styles.info}>
                <h3 className={styles.name}>
                  <button type="button" className={styles.open} data-row-action onClick={() => openProfile(student.github)}>
                    {student.name}
                  </button>
                </h3>
                <div className={styles.links}>
                  <a href={github} target="_blank" rel="noopener noreferrer">
                    <GithubMark size={14} />
                    <span>@{student.github}</span>
                  </a>
                  {student.telegram && (
                    <a href={`https://t.me/${encodeURIComponent(student.telegram)}`} target="_blank" rel="noopener noreferrer">
                      <TelegramMark size={14} />
                      <span>@{student.telegram}</span>
                    </a>
                  )}
                </div>
                <div className={styles.pills}>
                  {isMe && (
                    <span className={styles.me}>
                      <UserCheck size={12} strokeWidth={2} aria-hidden />
                      Это вы
                    </span>
                  )}
                  <span className={styles.pill}>{student.fact}</span>
                  {student.role && <span className={styles.role}>{student.role}</span>}
                  <a
                    className={styles.commits}
                    href={`${REPO_URL}/commits?author=${encodeURIComponent(student.github)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Коммиты ↗
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
