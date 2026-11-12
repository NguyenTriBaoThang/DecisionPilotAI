// Fluent Emoji 3D (c) Microsoft, MIT License; vendored in public/illustrations so demos work offline.
export type IllusName =
  | 'sun' | 'chat' | 'slider' | 'clipboard' | 'filebox' | 'testtube' | 'airplane' | 'pilot' | 'robot'
  | 'moneybag' | 'chartup' | 'cart' | 'megaphone' | 'warning' | 'bulb' | 'crystal' | 'package' | 'check' | 'pushpin'

export const illus = (name: IllusName): string => `/illustrations/${name}.png`
