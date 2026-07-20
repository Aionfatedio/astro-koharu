/**
 * Settings Registry
 *
 * Declarative registry for the Settings Center; see docs/adr/0001.
 * Add settings here and implement their application logic in src/store/settings.ts.
 */

import { bgmConfig, christmasConfig } from '@constants/site-config';

export type SettingSection = 'reader' | 'general';
export type SettingType = 'segmented' | 'number' | 'switch';

export interface SettingOption {
  value: string;
  label: string;
}

export interface SettingItem {
  /** Corresponding preference key in the settings store. */
  key: string;
  section: SettingSection;
  type: SettingType;
  label: string;
  /** Display unit for numeric controls; line height has no unit. */
  unit?: string;
  /** Step size for numeric controls. */
  step?: number;
  /** Options for segmented controls. */
  options?: SettingOption[];
  /** Build-time feature gate that hides unavailable settings. */
  gatedBy?: 'christmas' | 'bgm';
  /** Disable this setting while the master motion preference is enabled. */
  disabledByMasterMotion?: boolean;
}

export const SETTINGS_REGISTRY: SettingItem[] = [
  // Reader preferences
  {
    key: 'fontPreset',
    section: 'reader',
    type: 'segmented',
    label: '字体',
    options: [
      { value: 'round', label: '圆体' },
      { value: 'system', label: '系统黑体' },
      { value: 'serif', label: '衬线' },
      { value: 'wenkai', label: '文楷' },
      { value: 'local', label: '本机字体' },
    ],
  },
  {
    key: 'fontSize',
    section: 'reader',
    type: 'number',
    label: '字号',
    unit: 'px',
    step: 1,
  },
  {
    key: 'lineHeight',
    section: 'reader',
    type: 'number',
    label: '行距',
    step: 0.1,
  },
  {
    key: 'measure',
    section: 'reader',
    type: 'number',
    label: '行宽',
    unit: 'ch',
    step: 1,
  },
  {
    key: 'justify',
    section: 'reader',
    type: 'switch',
    label: '两端对齐',
  },

  // General preferences
  {
    key: 'scrollProgress',
    section: 'general',
    type: 'switch',
    label: '滚动进度条',
  },
  {
    key: 'christmas',
    section: 'general',
    type: 'switch',
    label: '圣诞特效',
    gatedBy: 'christmas',
  },
  {
    key: 'bgmWidget',
    section: 'general',
    type: 'switch',
    label: '背景音乐控件',
    gatedBy: 'bgm',
  },
  {
    key: 'masterMotion',
    section: 'general',
    type: 'switch',
    label: '减弱动画',
  },
  {
    key: 'wave',
    section: 'general',
    type: 'switch',
    label: '封面海浪',
    disabledByMasterMotion: true,
  },
];

/**
 * Hide settings whose build-time feature is unavailable.
 */
export function isSettingVisible(item: SettingItem): boolean {
  if (item.gatedBy === 'christmas') return christmasConfig.enabled;
  if (item.gatedBy === 'bgm') return bgmConfig.enabled && bgmConfig.audio.length > 0;
  return true;
}
