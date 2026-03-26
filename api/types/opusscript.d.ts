declare module "opusscript" {
  class OpusScript {
    static Application: {
      readonly VOIP: number;
      readonly AUDIO: number;
      readonly RESTRICTED_LOWDELAY: number;
    };

    constructor(sampleRate: number, channels: number, application: number);

    encode(pcm: Buffer | Uint8Array, frameSize: number): Buffer;
    decode(packet: Buffer | Uint8Array): Buffer;
    delete(): void;
  }

  export = OpusScript;
}
