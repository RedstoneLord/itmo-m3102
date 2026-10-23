import { Droplets, Monitor, Moon, Sparkles, Square, Sun } from 'lucide-react';
import type { SegmentedOption } from '../../components/ui/SegmentedControl';
import type { ThemePreference } from '../../types/models';
import type { AppStyle } from './settingsStore';

/** Варианты темы — одни и те же в меню пользователя и в настройках */
export const THEME_OPTIONS: SegmentedOption<ThemePreference>[] = [
  { value: 'light', label: 'Светлая', icon: Sun },
  { value: 'dark', label: 'Тёмная', icon: Moon },
  { value: 'system', label: 'Системная', icon: Monitor },
];

/** Стили оформления — одни и те же в меню «Оформление» и в настройках */
export const STYLE_OPTIONS: SegmentedOption<AppStyle>[] = [
  { value: 'minimal', label: 'Minimalism', icon: Square },
  { value: 'aurora', label: 'Aurora', icon: Sparkles },
  { value: 'glass', label: 'Liquid Glass', icon: Droplets },
];
