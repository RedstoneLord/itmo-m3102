import { FileText } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { AiDigestDialog, type AiDigestData } from './AiDigestDialog';

/** «Для ИИ»: открывает окно, где выбирают, что отдать (какие конспекты, заметки…) и как — файлом, текстом или ссылкой */
export function AiDigestButton(props: AiDigestData) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" icon={FileText} onClick={() => setOpen(true)}>
        Для ИИ
      </Button>
      <AiDigestDialog {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
