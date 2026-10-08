import { describe, expect, it } from 'vitest';
import { clockHalfPeriodUs, sourceOutputs, Simulator } from '../src/sim/simulator';
import { floating, known, unknown } from '../src/sim/signal';
import { makeCircuit } from './helpers';

const sig = (sim: Simulator, id: string, pin: string) => sim.pinSig(id, pin);

describe('helpers', () => {
  it('clockHalfPeriodUs rounds 1 / (2f) to microseconds', () => {
    expect(clockHalfPeriodUs(1)).toBe(500000);
    expect(clockHalfPeriodUs(10)).toBe(50000);
  });

  it('sourceOutputs masks a word to its width', () => {
    expect(sourceOutputs('word', { bits: 4 }, 0x1f)).toEqual({ out: known(0xf, 4) });
    expect(sourceOutputs('switch', {}, 1)).toEqual({ out: known(1, 1) });
  });
});

describe('combinational logic', () => {
  it('half adder: sum and carry match the truth table', () => {
    const c = makeCircuit(
      [
        ['a', 'switch'],
        ['b', 'switch'],
        ['x', 'xor', { inputs: 2, bits: 1 }],
        ['n', 'and', { inputs: 2, bits: 1 }],
        ['sumLed', 'led'],
        ['carryLed', 'led'],
      ],
      [
        ['a', 'out', 'x', 'in0'],
        ['b', 'out', 'x', 'in1'],
        ['a', 'out', 'n', 'in0'],
        ['b', 'out', 'n', 'in1'],
        ['x', 'out', 'sumLed', 'in'],
        ['n', 'out', 'carryLed', 'in'],
      ],
    );
    const sim = new Simulator();
    sim.build(c);
    for (const [a, b] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]) {
      sim.setInput('a', a);
      sim.setInput('b', b);
      expect(sig(sim, 'sumLed', 'in')).toEqual(known(a ^ b, 1));
      expect(sig(sim, 'carryLed', 'in')).toEqual(known(a & b, 1));
    }
  });

  it('changing a switch while paused updates the output without advance', () => {
    const sim = new Simulator();
    sim.build(
      makeCircuit(
        [
          ['sw', 'switch'],
          ['n', 'not'],
        ],
        [['sw', 'out', 'n', 'in0']],
      ),
    );
    expect(sig(sim, 'n', 'out')).toEqual(known(1, 1));
    sim.setInput('sw', 1);
    expect(sig(sim, 'n', 'out')).toEqual(known(0, 1));
    expect(sim.time()).toBe(0);
  });

  it('a junction joins its wires into one net', () => {
    const sim = new Simulator();
    sim.build(
      makeCircuit(
        [
          ['sw', 'switch'],
          ['j', 'junction'],
          ['led1', 'led'],
          ['led2', 'led'],
        ],
        [
          ['sw', 'out', 'j', 'p'],
          ['j', 'p', 'led1', 'in'],
          ['j', 'p', 'led2', 'in'],
        ],
      ),
    );
    sim.setInput('sw', 1);
    expect(sig(sim, 'led1', 'in')).toEqual(known(1, 1));
    expect(sig(sim, 'led2', 'in')).toEqual(known(1, 1));
  });

  it('an unwired input is floating and is counted in the warnings', () => {
    const sim = new Simulator();
    sim.build(makeCircuit([['led', 'led']], []));
    expect(sig(sim, 'led', 'in')).toEqual(floating(1));
    expect(sim.warnings().floating).toBe(1);
  });
});

describe('sequential logic and clocks', () => {
  it('T flip-flop on a 1 Hz clock toggles twice in 2 s and returns to 0', () => {
    const sim = new Simulator();
    sim.build(
      makeCircuit(
        [
          ['clk', 'clock', { freq: 1 }],
          ['t', 'const1'],
          ['ff', 'tff'],
        ],
        [
          ['t', 'out', 'ff', 't'],
          ['clk', 'out', 'ff', 'clk'],
        ],
      ),
    );
    expect(sig(sim, 'ff', 'q')).toEqual(known(0, 1));
    sim.advance(0.6e6);
    expect(sig(sim, 'ff', 'q')).toEqual(known(1, 1));
    sim.advance(1.4e6);
    expect(sig(sim, 'ff', 'q')).toEqual(known(0, 1));
  });

  it('4-bit counter at 10 Hz counts 100 edges in 10 s and shows 4', () => {
    const sim = new Simulator();
    sim.build(
      makeCircuit(
        [
          ['clk', 'clock', { freq: 10 }],
          ['en', 'const1'],
          ['clr', 'const0'],
          ['cnt', 'counter', { bits: 4 }],
        ],
        [
          ['clk', 'out', 'cnt', 'clk'],
          ['en', 'out', 'cnt', 'en'],
          ['clr', 'out', 'cnt', 'clr'],
        ],
      ),
    );
    sim.advance(10e6);
    expect(sig(sim, 'cnt', 'q')).toEqual(known(4, 4));
  });

  it('advance over 60 s at 10 Hz counts exactly 600 edges, so q is 8', () => {
    const parts = (): ReturnType<typeof makeCircuit> =>
      makeCircuit(
        [
          ['clk', 'clock', { freq: 10 }],
          ['en', 'const1'],
          ['clr', 'const0'],
          ['cnt', 'counter', { bits: 4 }],
        ],
        [
          ['clk', 'out', 'cnt', 'clk'],
          ['en', 'out', 'cnt', 'en'],
          ['clr', 'out', 'cnt', 'clr'],
        ],
      );
    const oneStep = new Simulator();
    oneStep.build(parts());
    oneStep.advance(60e6);
    expect(sig(oneStep, 'cnt', 'q')).toEqual(known(8, 4));

    const manySteps = new Simulator();
    manySteps.build(parts());
    for (let i = 0; i < 600; i++) manySteps.advance(0.1e6);
    expect(sig(manySteps, 'cnt', 'q')).toEqual(known(8, 4));
  });
});

describe('latches and oscillation', () => {
  const srLatch = () =>
    makeCircuit(
      [
        ['s', 'switch'],
        ['r', 'switch'],
        ['q1', 'nor', { inputs: 2, bits: 1 }],
        ['q2', 'nor', { inputs: 2, bits: 1 }],
      ],
      [
        ['r', 'out', 'q1', 'in0'],
        ['q2', 'out', 'q1', 'in1'],
        ['s', 'out', 'q2', 'in0'],
        ['q1', 'out', 'q2', 'in1'],
      ],
    );

  it('SR latch from two NOR gates holds, sets and resets', () => {
    const sim = new Simulator();
    sim.build(srLatch());
    sim.setInput('s', 1);
    expect(sig(sim, 'q1', 'out')).toEqual(known(1, 1));
    sim.setInput('s', 0);
    expect(sig(sim, 'q1', 'out')).toEqual(known(1, 1));
    sim.setInput('r', 1);
    expect(sig(sim, 'q1', 'out')).toEqual(known(0, 1));
  });

  it('NOR latch with S=R=1 holds both outputs at 0 without a warning', () => {
    const sim = new Simulator();
    sim.build(srLatch());
    sim.setInput('s', 1);
    sim.setInput('r', 1);
    expect(sig(sim, 'q1', 'out')).toEqual(known(0, 1));
    expect(sig(sim, 'q2', 'out')).toEqual(known(0, 1));
    expect(sim.warnings().oscillation).toBe(false);
  });

  it('three-NOT ring terminates and warns', () => {
    const sim = new Simulator();
    sim.build(
      makeCircuit(
        [
          ['n1', 'not'],
          ['n2', 'not'],
          ['n3', 'not'],
        ],
        [
          ['n1', 'out', 'n2', 'in0'],
          ['n2', 'out', 'n3', 'in0'],
          ['n3', 'out', 'n1', 'in0'],
        ],
      ),
    );
    expect(sim.warnings().oscillation).toBe(true);
    sim.advance(1e6);
    expect(sim.time()).toBe(1e6);
  });
});

describe('contention on shared nets', () => {
  it('two enabled tri-state drivers conflict to X', () => {
    const sim = new Simulator();
    sim.build(
      makeCircuit(
        [
          ['t1', 'tri', { bits: 1 }],
          ['t2', 'tri', { bits: 1 }],
          ['d1', 'const1'],
          ['d0', 'const0'],
          ['e1', 'const1'],
          ['e2', 'const1'],
          ['probe', 'probe', { bits: 1 }],
        ],
        [
          ['d1', 'out', 't1', 'in'],
          ['e1', 'out', 't1', 'en'],
          ['d0', 'out', 't2', 'in'],
          ['e2', 'out', 't2', 'en'],
          ['t1', 'out', 'probe', 'in'],
          ['t2', 'out', 'probe', 'in'],
        ],
      ),
    );
    expect(sig(sim, 'probe', 'in')).toEqual(unknown(1));
    expect(sim.warnings().conflicts).toBeGreaterThanOrEqual(1);
    expect(sim.wireConflict('w4')).toBe(true);
  });

  it('pull-up holds HIGH when nothing drives the net, and a driven LOW overrides it', () => {
    const sim = new Simulator();
    sim.build(
      makeCircuit(
        [
          ['pu', 'pullup'],
          ['t', 'tri', { bits: 1 }],
          ['d0', 'const0'],
          ['en', 'switch'],
          ['probe', 'probe', { bits: 1 }],
        ],
        [
          ['pu', 'out', 'probe', 'in'],
          ['d0', 'out', 't', 'in'],
          ['en', 'out', 't', 'en'],
          ['t', 'out', 'probe', 'in'],
        ],
      ),
    );
    expect(sig(sim, 'probe', 'in')).toEqual(known(1, 1));
    sim.setInput('en', 1);
    expect(sig(sim, 'probe', 'in')).toEqual(known(0, 1));
  });
});

describe('snapshots', () => {
  it('snapshot and restore carry time, inputs and states into a fresh engine', () => {
    const circuit = makeCircuit(
      [
        ['clk', 'clock', { freq: 10 }],
        ['en', 'const1'],
        ['clr', 'const0'],
        ['cnt', 'counter', { bits: 4 }],
        ['sw', 'switch'],
      ],
      [
        ['clk', 'out', 'cnt', 'clk'],
        ['en', 'out', 'cnt', 'en'],
        ['clr', 'out', 'cnt', 'clr'],
      ],
    );
    const a = new Simulator();
    a.build(circuit);
    a.setInput('sw', 1);
    a.advance(3e6);
    const snap = a.snapshot();

    const b = new Simulator();
    b.build(circuit);
    b.restore(snap);
    expect(b.time()).toBe(snap.timeUs);
    expect(b.getInput('sw')).toBe(1);
    expect(sig(b, 'cnt', 'q')).toEqual(sig(a, 'cnt', 'q'));
    expect(b.snapshot().states).toEqual(snap.states);
  });
});
