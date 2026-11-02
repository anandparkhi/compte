/** Convert browser microphone recordings to 16-kHz mono PCM WAV for Sarvam REST.
 * iOS Safari MediaRecorder commonly returns MP4/AAC, even if named speech.webm.
 * WAV removes browser-dependent MIME/codec support from the provider request.
 * The audio remains in memory; nothing is stored by Compte.
 */
export const WAV_SAMPLE_RATE = 16_000;
export const WAV_MIME_TYPE = "audio/wav";

export function encodePcm16Wav(samples: Float32Array, sampleRate = WAV_SAMPLE_RATE): Blob {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new Error("Invalid audio sample rate");
  }
  if (!samples.length) throw new Error("No microphone audio was captured. Record again.");
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(bytes);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) v.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, bytes.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true); // PCM subchunk size
  v.setUint16(20, 1, true); // uncompressed integer PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // 16 bits per sample
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, Number.isFinite(samples[i]) ? samples[i] : 0));
    v.setInt16(44 + i * 2, x < 0 ? Math.round(x * 32768) : Math.round(x * 32767), true);
  }
  return new Blob([bytes], { type: WAV_MIME_TYPE });
}

export async function recordingToWav(recording: Blob): Promise<Blob> {
  if (recording.size === 0) throw new Error("No microphone audio was captured. Record again.");
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await recording.arrayBuffer());
    if (!decoded.length || !decoded.duration) throw new Error("Recording was empty");
    // OfflineAudioContext resamples and automatically downmixes microphone channels to mono.
    const frames = Math.ceil(decoded.duration * WAV_SAMPLE_RATE);
    const offline = new OfflineAudioContext(1, frames, WAV_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodePcm16Wav(rendered.getChannelData(0));
  } catch (error) {
    console.error("[compte:stt] Unable to decode browser recording:", error instanceof Error ? error.message : "unknown");
    throw new Error("Couldn't prepare this recording for transcription. Please record again or type the sale.");
  } finally {
    await ctx.close().catch(() => {});
  }
}
