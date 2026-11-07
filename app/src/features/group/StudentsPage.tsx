import { UserCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
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

type RawKhinkaliData = Record<string, unknown> | Array<{ nick?: string; github?: string; name?: string; count?: number; khinkali?: number }>;

function studentKhinkaliCount(data: RawKhinkaliData | null, student: { github: string; name: string }): number {
  if (!data) return 0;
  const map: unknown =
    (data as { students?: unknown }).students && typeof (data as { students?: unknown }).students === 'object'
      ? (data as { students: unknown }).students
      : data;
  if (Array.isArray(map)) {
    const nickLow = student.github.toLowerCase();
    const nameLow = student.name.toLowerCase();
    const hit = map.find((x: { nick?: string; github?: string; name?: string; count?: number; khinkali?: number }) => {
      const k = String(x?.nick ?? x?.github ?? x?.name ?? '').toLowerCase();
      return k === nickLow || k === nameLow;
    });
    return hit ? Number(hit.count ?? hit.khinkali ?? 0) || 0 : 0;
  }
  if (map && typeof map === 'object') {
    const nickLow = student.github.toLowerCase();
    const nameLow = student.name.toLowerCase();
    const surnameLow = student.name.split(' ')[0]?.toLowerCase() ?? '';
    for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
      const kl = k.toLowerCase();
      if (kl === nickLow || kl === nameLow || kl === surnameLow) {
        return Number(v) || 0;
      }
    }
  }
  return 0;
}

function totalKhinkaliCount(data: RawKhinkaliData | null, students: typeof M3102_STUDENTS): number {
  if (data && typeof (data as { total?: unknown }).total === 'number') {
    return (data as { total: number }).total;
  }
  return students.reduce((sum, s) => sum + studentKhinkaliCount(data, s), 0);
}

/** Студенты группы М3102: фото с GitHub, контакты, факт о себе и коммиты; карточка открывает профиль. */
export function StudentsPage() {
  // Профиль — общее окно в AppShell (useProfileStore), не адрес: смена адреса перерисовывает всё приложение,
  // и окно «застывало». ?u=логин в ссылке только открывает профиль — и сразу убирается из адреса
  const [params, setParams] = useSearchParams();
  const openProfile = useProfileStore((state) => state.open);
  const prepareProfile = useProfileStore((state) => state.prepare);
  const me = useMeStore((state) => state.login);
  const [khinkali, setKhinkali] = useState<RawKhinkaliData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchKhinkali() {
      const urls = ['./data/khinkali.json', './classic/data/khinkali.json', '/data/khinkali.json'];
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const json = (await res.json()) as RawKhinkaliData;
            if (!cancelled) setKhinkali(json);
            return;
          }
        } catch {}
      }
      try {
        const res = await fetch('https://raw.githubusercontent.com/RedstoneLord/itmo-m3102/master/data/khinkali.json');
        if (res.ok) {
          const json = (await res.json()) as RawKhinkaliData;
          if (!cancelled) setKhinkali(json);
        }
      } catch {}
    }
    void fetchKhinkali();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(prepareProfile, [prepareProfile]);
  useEffect(() => {
    const login = params.get('u');
    if (!login) return;
    // Сначала чистим адрес, потом открываем: запись профиля в истории должна лечь поверх уже чистого адреса
    setParams({}, { replace: true });
    openProfile(login);
  }, [params, setParams, openProfile]);

  const total = totalKhinkaliCount(khinkali, M3102_STUDENTS);

  return (
    <>
      <PageHeader
        title="Студенты группы М3102"
        subtitle="Нажмите на карточку — откроется профиль. «Коммиты» — история правок студента в репозитории материалов группы."
        actions={
          <div className={styles.totalBadge} title="Общий счётчик хинкали группы">
            <span className={styles.totalIcon}>🥟</span>
            <div className={styles.totalInfo}>
              <span className={styles.totalCount}>{total}</span>
              <span className={styles.totalLabel}>хинкали всего</span>
            </div>
          </div>
        }
      />
      <div className={`${styles.grid} stagger`}>
        {M3102_STUDENTS.map((student) => {
          const github = `https://github.com/${encodeURIComponent(student.github)}`;
          const isMe = student.github === me;
          const count = studentKhinkaliCount(khinkali, student);
          return (
            <article key={student.github} className={cn(styles.card, isMe && styles.mine)} data-spot>
              <div className={styles.photoCol}>
                <img
                  className={styles.photo}
                  src={`${github}.png?size=160`}
                  alt=""
                  loading="lazy"
                  onError={(event) => (event.currentTarget.style.visibility = 'hidden')}
                />
                <span className={styles.khinkaliBadge} title="Съедено хинкали">
                  🥟 {count}
                </span>
              </div>
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
