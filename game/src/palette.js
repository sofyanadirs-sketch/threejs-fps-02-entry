// The look plan, in one place: dusk over a night market. Warm amber stall light
// against a violet dusk sky, teal as the defenders' accent, durian yellow as the
// attackers'. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  dusk: '#241a33', // sky / fog
  ground: '#2e2620', // asphalt
  stallWood: '#6b4a2f',
  stallCloth: '#c94f38', // awning red
  stallCloth2: '#e8a13a', // awning amber
  stallCloth3: '#2f7d6b', // awning teal
  cartMetal: '#8a8f96',
  crate: '#7a5c38',
  leaf: '#3f7a3a',
  trunk: '#5a3d26',
  ink: '#f2ead8', // warm off-white
  muted: '#a89a86',
  amber: '#ffb347', // attackers / stall light
  teal: '#3ec9b8', // defenders
  durian: '#d8c93a', // the bomb
  danger: '#e5484d',
};

export function shade(name) {
  return PALETTE[name];
}
