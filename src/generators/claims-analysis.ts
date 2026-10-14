// Who holds, wants and occupies what: per-state figures and the most disputed pairs of states

export interface StateClaims {
  i: number;
  provinces: number;
  cores: number; // its provinces it holds a core on
  nonCore: number; // its provinces without its core
  occupied: number; // its provinces held by another state
  occupying: number; // foreign provinces it holds
  irredenta: number; // its cores on provinces of other states
  claims: number; // its claims on provinces of other states
  claimed: number; // its provinces other states claim or hold cores on
  tension: number;
}

export interface Dispute {
  a: number; // the state that wants or holds land
  b: number; // the state that owns it
  cores: number;
  claims: number;
  occupied: number;
  relation: string;
  score: number;
}

const RELATION_SCORE: Record<string, number> = { Enemy: 6, Rival: 3, Suspicion: 1 };

/** Disputes between ordered pairs: a wants or holds land of b */
export function getDisputes(): Dispute[] {
  const { provinces, states } = pack;
  const disputes = new Map<string, Dispute>();
  const get = (a: number, b: number) => {
    const key = `${a}-${b}`;
    let dispute = disputes.get(key);
    if (!dispute) {
      const relation = states[a]?.diplomacy?.[b] ?? "";
      dispute = { a, b, cores: 0, claims: 0, occupied: 0, relation, score: RELATION_SCORE[relation] ?? 0 };
      disputes.set(key, dispute);
    }
    return dispute;
  };
  const living = (id: number) => Boolean(id && states[id] && !states[id].removed);

  for (const province of provinces) {
    if (!province?.i || province.removed || !living(province.state)) continue;
    const owner = province.state;
    for (const id of province.cores ?? []) if (id !== owner && living(id)) get(id, owner).cores++;
    for (const id of province.claims ?? []) if (id !== owner && living(id)) get(id, owner).claims++;
    if (province.controller && living(province.controller)) get(province.controller, owner).occupied++;
  }
  // wars without a land dispute still count
  for (const a of states)
    for (const b of states) {
      if (living(a.i) && living(b.i) && a.i < b.i && a.diplomacy?.[b.i] === "Enemy" && !disputes.has(`${b.i}-${a.i}`))
        get(a.i, b.i);
    }

  for (const dispute of disputes.values())
    dispute.score += dispute.cores * 3 + dispute.claims * 2 + dispute.occupied * 2;
  return [...disputes.values()].sort((x, y) => y.score - x.score || x.a - y.a || x.b - y.b);
}

export function getStateClaims(): StateClaims[] {
  const { provinces, states } = pack;
  const rows = new Map<number, StateClaims>();
  for (const state of states) {
    if (!state.i || state.removed) continue;
    rows.set(state.i, {
      i: state.i,
      provinces: 0,
      cores: 0,
      nonCore: 0,
      occupied: 0,
      occupying: 0,
      irredenta: 0,
      claims: 0,
      claimed: 0,
      tension: 0
    });
  }

  for (const province of provinces) {
    if (!province?.i || province.removed) continue;
    const owner = rows.get(province.state);
    if (owner) {
      owner.provinces++;
      if (province.cores?.includes(province.state)) owner.cores++;
      else owner.nonCore++;
      if (province.controller) owner.occupied++;
      if (province.claims?.length || province.cores?.some(id => id !== province.state)) owner.claimed++;
    }
    const occupier = rows.get(province.controller ?? 0);
    if (occupier) occupier.occupying++;
    for (const id of province.cores ?? []) if (id !== province.state && rows.has(id)) rows.get(id)!.irredenta++;
    for (const id of province.claims ?? []) if (rows.has(id)) rows.get(id)!.claims++;
  }

  for (const dispute of getDisputes()) {
    if (rows.has(dispute.a)) rows.get(dispute.a)!.tension += dispute.score;
    if (rows.has(dispute.b)) rows.get(dispute.b)!.tension += dispute.score;
  }
  return [...rows.values()];
}
