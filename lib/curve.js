// The shell climbs exponentially: multiplier = e^(GROWTH * seconds).
export const GROWTH = 0.11;

export const multiplierAt = (ms) => Math.exp((GROWTH * ms) / 1000);
export const timeAt = (m) => (Math.log(m) / GROWTH) * 1000;

// Multipliers are shown (and paid) to two decimals, always rounded down.
export const floor2 = (x) => Math.floor(x * 100 + 1e-9) / 100;

// Amounts are integer cents; a payout rounds down to the cent.
export const payoutFor = (amount, m) => Math.floor((amount * Math.round(m * 100)) / 100);
