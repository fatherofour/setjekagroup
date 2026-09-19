/* Setjeka brand tokens shared by the sign-in, forgot-password, and
   reset-password screens. Ported from OpenConstructionERP's LoginPage.tsx,
   which cites approved mockups 4a (desktop) and 4b (mobile) as the source. */
export const CREAM = '#F9F4ED';
export const SAND = '#EBDDC5';
export const SAGE = '#E1EECC';
export const CARD_CREAM = '#F5EAD8';
export const GREEN = '#0E3D2C';
export const GREEN_HOVER = '#0A2F22';
export const GREEN_TEXT = '#F5EAD8';
export const INK = '#201E1D';
export const FONT_DISPLAY = "'Caprasimo', serif";
export const FONT_BODY = "'Figtree', system-ui, sans-serif";

export const pillInput =
  'w-full rounded-full border bg-white text-[15px] outline-none transition-shadow placeholder:text-[rgba(32,30,29,.38)]';
export const pillInputStyle = { fontFamily: FONT_BODY, color: INK, borderColor: '#0E3D2C00', padding: '16px 22px' } as const;

export function focusPill(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = GREEN;
  e.currentTarget.style.outline = `2px solid ${GREEN}`;
  e.currentTarget.style.outlineOffset = '2px';
}

export function blurPill(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = '#0E3D2C00';
  e.currentTarget.style.outline = 'none';
}
