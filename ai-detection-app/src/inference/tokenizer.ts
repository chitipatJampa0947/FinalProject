import { Tokenizer, PrecompiledNormalizer, SequenceNormalizer } from '@huggingface/tokenizers';

// Public, exported normalizer extension points in pinned tokenizers.js 0.1.3.
// Unlike its NFKC approximation, execute the model's actual SentencePiece map.
class SavedCharsmapNormalizer extends PrecompiledNormalizer {
  private readonly trie: Uint32Array;
  private readonly strings: Uint8Array;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  constructor(config: ConstructorParameters<typeof PrecompiledNormalizer>[0]) {
    super(config);
    const bytes = Uint8Array.from(atob(config.precompiled_charsmap), c => c.charCodeAt(0));
    if (bytes.length < 8) throw new Error('Invalid saved normalization map');
    const size = new DataView(bytes.buffer).getUint32(0, true);
    if (!size || size % 4 || size + 4 >= bytes.length) throw new Error('Invalid normalization trie');
    this.trie = new Uint32Array(bytes.buffer, 4, size / 4);
    this.strings = bytes.subarray(size + 4);
  }

  override normalize(text: string): string {
    const bytes = this.encoder.encode(text);
    const output: string[] = [];
    const offset = (u: number) => (u >>> 10) * 2 ** ((u & 512) >>> 6);
    for (let p = 0; p < bytes.length;) {
      let pos = offset(this.trie[0]), length = 0, value = 0;
      for (let i = p; i < bytes.length; i++) {
        pos ^= bytes[i];
        const u = this.trie[pos];
        if (u === undefined || ((u & 0x800000ff) >>> 0) !== bytes[i]) break;
        pos ^= offset(u);
        if (u & 256) {
          length = i - p + 1;
          value = this.trie[pos] & 0x7fffffff;
        }
      }
      if (length) {
        let end = value;
        while (end < this.strings.length && this.strings[end]) end++;
        if (end >= this.strings.length) throw new Error('Invalid normalization string');
        output.push(this.decoder.decode(this.strings.subarray(value, end)));
        p += length;
      } else {
        const c = bytes[p], n = c < 128 ? 1 : c < 224 ? 2 : c < 240 ? 3 : 4;
        output.push(this.decoder.decode(bytes.subarray(p, p + n)));
        p += n;
      }
    }
    return output.join('');
  }
}

export const MAX_LENGTH = 400;
export type Encoding400 = { input_ids: number[]; attention_mask: number[] };

export function createTokenizer(definition: object, config: object): (text: string) => Encoding400 {
  const spec = definition as { normalizer?: ConstructorParameters<typeof SequenceNormalizer>[0] };
  const sequence = spec.normalizer;
  if (sequence?.type !== 'Sequence' ||
      sequence.normalizers.length !== 3 ||
      sequence.normalizers[0].type !== 'Precompiled' ||
      sequence.normalizers[1].type !== 'Strip' || sequence.normalizers[2].type !== 'Replace') {
    throw new Error('Unsupported tokenizer normalization contract');
  }
  const tokenizer = new Tokenizer(definition, config);
  const normalizer = new SequenceNormalizer(sequence);
  normalizer.normalizers[0] = new SavedCharsmapNormalizer(sequence.normalizers[0]);
  // This property and these classes are public in the pinned package's types.
  tokenizer.normalizer = normalizer;
  if (tokenizer.token_to_id('<s>') !== 5 || tokenizer.token_to_id('</s>') !== 6 ||
      tokenizer.token_to_id('<pad>') !== 1) throw new Error('Tokenizer special-token mismatch');
  return (text: string) => {
    const content = tokenizer.encode(text, { add_special_tokens: false }).ids;
    const input_ids = [5, ...content.slice(0, MAX_LENGTH - 2), 6];
    const attention_mask = new Array<number>(input_ids.length).fill(1);
    while (input_ids.length < MAX_LENGTH) { input_ids.push(1); attention_mask.push(0); }
    return { input_ids, attention_mask };
  };
}
