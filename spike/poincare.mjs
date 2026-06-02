// Throwaway Phase-1 spike: a small, *precise* Poincaré-disk hyperbolic kit.
// Points are complex numbers z with |z| < 1. Orientation-preserving isometries
// of the disk form SU(1,1): z ↦ (a·z + b) / (conj(b)·z + conj(a)), |a|²−|b|² = 1.
// We represent an isometry by its (a, b) and compose by matrix multiplication,
// which is what a real hyperbolic UI does when you pan/rotate the view.

/* ---- complex ---- */
export const C = (re, im = 0) => ({ re, im });
export const add = (x, y) => C(x.re + y.re, x.im + y.im);
export const sub = (x, y) => C(x.re - y.re, x.im - y.im);
export const mul = (x, y) => C(x.re * y.re - x.im * y.im, x.re * y.im + x.im * y.re);
export const conj = (x) => C(x.re, -x.im);
export const neg = (x) => C(-x.re, -x.im);
export const abs2 = (x) => x.re * x.re + x.im * x.im;
export const abs = (x) => Math.hypot(x.re, x.im);
export const div = (x, y) => {
  const d = abs2(y);
  return C((x.re * y.re + x.im * y.im) / d, (x.im * y.re - x.re * y.im) / d);
};
export const scale = (x, s) => C(x.re * s, x.im * s);

/* ---- isometries (SU(1,1)) ---- */
export const ident = () => ({ a: C(1), b: C(0) });

/** Recenter: the unique transform sending point p to the origin. */
export const recenter = (p) => {
  const s = Math.sqrt(1 - abs2(p));
  return { a: C(1 / s), b: scale(neg(p), 1 / s) };
};

/** Rotation about the origin by angle θ. */
export const rotation = (theta) => ({ a: C(Math.cos(theta / 2), Math.sin(theta / 2)), b: C(0) });

/** Compose: returns the isometry equivalent to (apply m1, then m2). */
export const compose = (m2, m1) => ({
  a: add(mul(m2.a, m1.a), mul(m2.b, conj(m1.b))),
  b: add(mul(m2.a, m1.b), mul(m2.b, conj(m1.a))),
});

export const apply = (m, z) =>
  div(add(mul(m.a, z), m.b), add(mul(conj(m.b), z), conj(m.a)));

export const inverse = (m) => ({ a: conj(m.a), b: neg(m.b) });

/** The SU(1,1) invariant |a|²−|b|² (should stay exactly 1). */
export const invariant = (m) => abs2(m.a) - abs2(m.b);
export const invariantError = (m) => Math.abs(invariant(m) - 1);

/** Project a drifted matrix back onto SU(1,1). */
export const normalize = (m) => {
  const s = Math.sqrt(invariant(m));
  return { a: scale(m.a, 1 / s), b: scale(m.b, 1 / s) };
};

/* ---- distance ---- */
export const distance = (z, w) =>
  2 * Math.atanh(Math.min(1 - 1e-18, abs(div(sub(z, w), sub(C(1), mul(conj(w), z))))));

/** Hyperbolic radius ρ ↔ Euclidean radius in the disk. */
export const rhoToR = (rho) => Math.tanh(rho / 2);
