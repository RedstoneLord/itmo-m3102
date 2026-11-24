import { useEffect, useMemo, useRef } from 'react';
import { mountStudyDiagram, studyArt, type StudyModel } from './player';
import './study.css';

export function StudyDiagram({ model }: { model: StudyModel }) {
  const host = useRef<HTMLDivElement>(null);
  const art = useMemo(() => ({ __html: studyArt(model) }), [model]);

  useEffect(() => mountStudyDiagram(host.current!, model), [model]);

  return <div ref={host} className="study-host" dangerouslySetInnerHTML={art} />;
}
