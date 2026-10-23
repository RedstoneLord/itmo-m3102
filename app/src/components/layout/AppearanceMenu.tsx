import { Palette } from 'lucide-react';
import { useSettingsStore } from '../../features/settings/settingsStore';
import { STYLE_OPTIONS, THEME_OPTIONS } from '../../features/settings/themeOptions';
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from '../ui/DropdownMenu';
import { IconButton } from '../ui/IconButton';

/** Быстрый выбор оформления: стиль и тема. Меню остаётся открытым — результат виден сразу, можно перебрать варианты. */
export function AppearanceMenu() {
  const style = useSettingsStore((state) => state.style);
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setAppearance = useSettingsStore((state) => state.setAppearance);

  return (
    <DropdownMenu align="end" trigger={(props) => <IconButton icon={Palette} label="Оформление" {...props} />}>
      <DropdownLabel>Стиль</DropdownLabel>
      {STYLE_OPTIONS.map((option) => (
        <DropdownItem
          key={option.value}
          icon={option.icon}
          checked={style === option.value}
          keepOpen
          onSelect={() => setAppearance({ style: option.value })}
        >
          {option.label}
        </DropdownItem>
      ))}
      <DropdownSeparator />
      <DropdownLabel>Тема</DropdownLabel>
      {THEME_OPTIONS.map((option) => (
        <DropdownItem key={option.value} icon={option.icon} checked={theme === option.value} keepOpen onSelect={() => setTheme(option.value)}>
          {option.label}
        </DropdownItem>
      ))}
    </DropdownMenu>
  );
}
