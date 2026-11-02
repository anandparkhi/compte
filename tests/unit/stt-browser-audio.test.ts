import { afterEach, describe, expect, it, vi } from "vitest";
import { encodePcm16Wav, WAV_SAMPLE_RATE } from "@/lib/audio/wav";
import { MAX_AUDIO_BYTES, transcribe } from "@/server/services/stt";

const originalKey = process.env.SARVAM_API_KEY;
afterEach(() => {
  if (originalKey === undefined) delete process.env.SARVAM_API_KEY;
  else process.env.SARVAM_API_KEY = originalKey;
});

describe("iPhone / browser speech recording compatibility", () => {
  it("encodes actual 16-bit 16 kHz mono PCM WAV bytes", async () => {
    const wav = encodePcm16Wav(new Float32Array([1, -1, 0, 0.5]));
    expect(wav.type).toBe("audio/wav");
    const data = new DataView(await wav.arrayBuffer());
    const chars = (offset: number, count: number) =>
      String.fromCharCode(...new Uint8Array(data.buffer, offset, count));
    expect(chars(0, 4)).toBe("RIFF");
    expect(chars(8, 4)).toBe("WAVE");
    expect(chars(12, 4)).toBe("fmt ");
    expect(chars(36, 4)).toBe("data");
    expect(data.getUint16(20, true)).toBe(1);
    expect(data.getUint16(22, true)).toBe(1);
    expect(data.getUint32(24, true)).toBe(WAV_SAMPLE_RATE);
    expect(data.getUint16(34, true)).toBe(16);
    expect(data.getUint32(40, true)).toBe(8);
    expect(data.getInt16(44, true)).toBe(32767);
    expect(data.getInt16(46, true)).toBe(-32768);
    expect(data.getInt16(48, true)).toBe(0);
    expect(data.getInt16(50, true)).toBe(16384);
  });
  it("fits the provider upload limit for a 29-second recording", () => {
    const samples = new Float32Array(29 * WAV_SAMPLE_RATE);
    expect(encodePcm16Wav(samples).size).toBeLessThan(MAX_AUDIO_BYTES);
  });
  it("sends a real WAV with a .wav filename to Sarvam", async () => {
    process.env.SARVAM_API_KEY = "test-key";
    const pcm = encodePcm16Wav(new Float32Array(16000));
    const mockFetch = vi.fn(async (_url: string, options: RequestInit) => {
      const form = options.body as FormData;
      const file = form.get("file");
      expect(file).toBeInstanceOf(Blob);
      expect((file as File).name).toBe("speech.wav");
      expect((file as Blob).type).toBe("audio/wav");
      expect(form.get("language_code")).toBe("mr-IN");
      expect(options.headers).toEqual({ "api-subscription-key": "test-key" });
      return new Response(JSON.stringify({ transcript: "रमेशला पाच बॉक्स", language_code: "mr-IN" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    });
    const result = await transcribe(pcm, "mr", mockFetch as typeof fetch);
    expect(result).toMatchObject({ status: "OK", transcript: "रमेशला पाच बॉक्स", languageCode: "mr-IN" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it("rejects Safari AAC/MP4 instead of sending an unsupported file to provider", async () => {
    process.env.SARVAM_API_KEY = "test-key";
    const mockFetch = vi.fn();
    const mp4 = new Blob([new Uint8Array(48)], { type: "audio/mp4; codecs=mp4a.40.2" });
    await expect(transcribe(mp4, "auto", mockFetch as typeof fetch)).rejects.toMatchObject({
      status: 415, code: "AUDIO_FORMAT_UNSUPPORTED",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it("rejects a falsely labeled WAV file", async () => {
    process.env.SARVAM_API_KEY = "test-key";
    const fake = new Blob([new Uint8Array(48)], { type: "audio/wav" });
    await expect(transcribe(fake, "auto", vi.fn() as typeof fetch)).rejects.toMatchObject({
      code: "AUDIO_FORMAT_UNSUPPORTED",
    });
  });
});
