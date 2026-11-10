import { useColorScheme } from 'react-native';

const light = {
  background: '#F6F5F2',
  surface: '#FFFFFF',
  border: '#E3E0D9',
  text: '#1C1B19',
  muted: '#6B6862',
  primary: '#1F6F5C',
  onPrimary: '#FFFFFF',
  danger: '#B3261E',
};

const dark: typeof light = {
  background: '#121211',
  surface: '#1D1C1A',
  border: '#33312D',
  text: '#F2F0EB',
  muted: '#A3A099',
  primary: '#5CC2A6',
  onPrimary: '#0B2A22',
  danger: '#F2B8B5',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = 12;
