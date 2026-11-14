// State, in one place: everything the simulation reads and writes. Rendering
// and the HUD only read from here; nothing else keeps a second copy of a fact.
export const PHASE = {
  BUY: 'buy', // buy menu open, bots hold at spawn
  LIVE: 'live', // the round is running
  ROUND_END: 'round_end', // banner, then the next round
  MATCH_END: 'match_end', // first to 5, then play again
};

export const WIN_ROUNDS = 5;
export const ROUND_TIME = 100;
export const BUY_TIME = 14;
export const BOMB_TIME = 35;
export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;

export function createState() {
  return {
    phase: PHASE.BUY,
    phaseT: BUY_TIME, // seconds left in this phase
    round: 1,
    score: { atk: 0, def: 0 },
    money: 800,
    kills: 0,
    deaths: 0,
    bomb: {
      state: 'carried', // carried | planted | dropped | exploded | defused
      carrier: 'player', // 'player' or a bot id
      site: null,
      fuse: 0,
      progress: 0, // plant/defuse channel 0..1
      actor: null, // who is channelling
      x: 0, z: 0,
    },
    feed: [], // { text, t } kill-feed lines, newest first
    banner: null, // { title, sub } shown on the overlay
    elapsed: 0,
  };
}
