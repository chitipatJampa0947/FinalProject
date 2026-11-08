export const CATEGORIES = ['human', 'gpt', 'gemini', 'other'] as const;
export type DetectCategory = typeof CATEGORIES[number];
export type ClassProbs = Record<DetectCategory, number>;
export type DetectResult = {
  category: DetectCategory;
  probs: ClassProbs;
  aiProbability: number;
  artifactId: string;
};
export type CompletedDetection = DetectResult & { text: string };

export function classify(logits: ArrayLike<number>, artifactId: string): DetectResult {
  const values = Array.from(logits);
  if (values.length !== 4 || !values.every(Number.isFinite)) throw new Error('Expected four finite logits');
  const max = Math.max(...values), exps = values.map(x => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0), p = exps.map(x => x / sum);
  let top = 0;
  for (let i = 1; i < 4; i++) if (values[i] > values[top]) top = i;
  return { category: CATEGORIES[top], probs: { human: p[0], gpt: p[1], gemini: p[2], other: p[3] },
    aiProbability: 1 - p[0], artifactId };
}

export type TensorMetadata = { name: string; isTensor: boolean; type?: string; shape?: readonly (number | string)[] };
export function verifySessionSchema(inputs: readonly TensorMetadata[], outputs: readonly TensorMetadata[]): void {
  if (inputs.length !== 2 || outputs.length !== 1) throw new Error('Incompatible ONNX input/output count');
  for (const name of ['input_ids', 'attention_mask']) {
    const m = inputs.find(x => x.name === name);
    if (!m?.isTensor || m.type !== 'int64' || m.shape?.length !== 2 ||
        (typeof m.shape[0] === 'number' && m.shape[0] !== 1) ||
        (typeof m.shape[1] === 'number' && m.shape[1] !== 400)) throw new Error('Incompatible input: ' + name);
  }
  const o = outputs[0];
  if (o.name !== 'logits' || !o.isTensor || o.type !== 'float32' || o.shape?.length !== 2 ||
      (typeof o.shape[0] === 'number' && o.shape[0] !== 1) ||
      (typeof o.shape[1] === 'number' && o.shape[1] !== 4)) throw new Error('Incompatible logits schema');
}
