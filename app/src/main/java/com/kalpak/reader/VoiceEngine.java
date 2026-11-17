package com.kalpak.reader;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.media.PlaybackParams;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

/**
 * ভারতীয় বাংলা কণ্ঠ (AI4Bharat Indic-TTS, MIT লাইসেন্স) — ফোনের ভেতরেই চলে।
 * তিনটি ONNX গ্রাফ: অক্ষর থেকে এনকোডারের ফল ও স্থায়িত্ব, সেখান থেকে মেল-বর্ণালি, তারপর শব্দতরঙ্গ।
 */
class VoiceEngine {

    interface Listener {
        void event(String channel, String kind, String arg);
    }

    private static final String BASE = "https://github.com/bhuniaparag46-stack/kalpak_reader/releases/download/voice-bn-v1/";
    private static final String[] FILES = {"tokens.json", "enc.int8.onnx", "dec.int8.onnx", "voc.onnx"};
    private static final long[] SIZES = {3353L, 26682402L, 35719323L, 55748248L};
    private static final int SR = 22050;
    private static final int MAX_TOKENS = 150;

    private final File dir;
    private final File audioDir;
    private volatile int prepGen = 0;
    private final Listener listener;
    private final ExecutorService synthExec = Executors.newSingleThreadExecutor();
    private final ExecutorService playExec = Executors.newSingleThreadExecutor();
    private final ConcurrentHashMap<String, Future<short[]>> cache = new ConcurrentHashMap<>();

    private volatile int gen = 0;
    private volatile boolean downloading = false;
    private volatile int percent = 0;

    private OrtEnvironment env;
    private OrtSession enc;
    private OrtSession dec;
    private OrtSession voc;
    private final Map<Character, Long> table = new HashMap<>();
    private AudioTrack track;

    VoiceEngine(File filesDir, Listener listener) {
        this.dir = new File(filesDir, "voice");
        this.audioDir = new File(filesDir, "audio");
        this.listener = listener;
    }

    /* ---------- অবস্থা ও নামানো ---------- */

    String status() {
        if (downloading) {
            return "downloading:" + percent;
        }
        return new File(dir, "ok").exists() ? "ready" : "none";
    }

    void download() {
        if (downloading || "ready".equals(status())) {
            return;
        }
        downloading = true;
        percent = 0;
        new Thread(() -> {
            try {
                if (!dir.exists()) {
                    dir.mkdirs();
                }
                long total = 0;
                for (long s : SIZES) {
                    total += s;
                }
                long done = 0;
                byte[] buf = new byte[65536];
                for (int i = 0; i < FILES.length; i++) {
                    File target = new File(dir, FILES[i]);
                    if (target.exists() && target.length() == SIZES[i]) {
                        done += SIZES[i];
                        continue;
                    }
                    File part = new File(dir, FILES[i] + ".part");
                    HttpURLConnection c = (HttpURLConnection) new URL(BASE + FILES[i]).openConnection();
                    c.setInstanceFollowRedirects(true);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(30000);
                    int code = c.getResponseCode();
                    if (code != 200) {
                        throw new Exception("HTTP " + code);
                    }
                    try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                        int n;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n);
                            done += n;
                            int p = (int) (done * 100 / total);
                            if (p != percent) {
                                percent = p;
                                listener.event("kalpakVoice", "progress", String.valueOf(p));
                            }
                        }
                    } finally {
                        c.disconnect();
                    }
                    if (part.length() != SIZES[i]) {
                        part.delete();
                        throw new Exception("size");
                    }
                    if (target.exists()) {
                        target.delete();
                    }
                    if (!part.renameTo(target)) {
                        throw new Exception("rename");
                    }
                }
                new FileOutputStream(new File(dir, "ok")).close();
                downloading = false;
                listener.event("kalpakVoice", "ready", "");
            } catch (Exception e) {
                downloading = false;
                listener.event("kalpakVoice", "error", "");
            }
        }).start();
    }

    void delete() {
        stop();
        synthExec.submit(() -> {
            closeSessions();
            File[] fs = dir.listFiles();
            if (fs != null) {
                for (File f : fs) {
                    f.delete();
                }
            }
            listener.event("kalpakVoice", "deleted", "");
        });
    }

    /* ---------- পড়ে শোনানো ---------- */

    void speak(final String text, final String uid, final int speaker, final double rate, final String next) {
        final int myGen = gen;
        final float r = (float) Math.max(0.5, Math.min(2.0, rate));
        final String key = speaker + "|" + text;
        final String nextKey = (next == null || next.isEmpty()) ? null : speaker + "|" + next;
        for (String k : cache.keySet()) {
            if (!k.equals(key) && !k.equals(nextKey)) {
                Future<short[]> f = cache.remove(k);
                if (f != null) {
                    f.cancel(false);
                }
            }
        }
        /* আগে থেকে তৈরি থাকলে সরাসরি ফাইল থেকে বাজে, মডেলের সারিতে দাঁড়াতে হয় না */
        final boolean ready = audioFile(speaker, text).exists();
        final Future<short[]> fut = ready ? null : cache.computeIfAbsent(key, k -> synthExec.submit(() -> pcmFor(text, speaker)));
        if (nextKey != null && !audioFile(speaker, next).exists()) {
            cache.computeIfAbsent(nextKey, k -> synthExec.submit(() -> pcmFor(next, speaker)));
        }
        playExec.submit(() -> {
            try {
                short[] pcm = ready ? readPcm(audioFile(speaker, text)) : fut.get();
                cache.remove(key);
                if (myGen != gen) {
                    return;
                }
                listener.event("kalpakTts", "start", uid);
                play(pcm, myGen, r);
                if (myGen == gen) {
                    listener.event("kalpakTts", "done", uid);
                }
            } catch (Throwable e) {
                cache.remove(key);
                if (myGen == gen) {
                    listener.event("kalpakTts", "error", uid);
                }
            }
        });
    }

    /* ---------- অধ্যায় আগে থেকে তৈরি করে রাখা ---------- */

    void prepare(final List<String> sentences, final int speaker) {
        final int myPrep = ++prepGen;
        prepStep(sentences, speaker, 0, myPrep);
    }

    private void prepStep(final List<String> sentences, final int speaker, final int index, final int myPrep) {
        /* প্রতি বাক্যের পর সারিতে নতুন করে দাঁড়ায়, যাতে চলতি পাঠের বাক্য আগে সুযোগ পায় */
        synthExec.submit(() -> {
            if (myPrep != prepGen) {
                return;
            }
            if (index >= sentences.size()) {
                listener.event("kalpakVoice", "prepdone", "");
                return;
            }
            try {
                pcmFor(sentences.get(index), speaker);
            } catch (Throwable e) {
                listener.event("kalpakVoice", "preperror", "");
                return;
            }
            listener.event("kalpakVoice", "prep", (index + 1) + "-" + sentences.size());
            prepStep(sentences, speaker, index + 1, myPrep);
        });
    }

    void cancelPrepare() {
        prepGen++;
    }

    long audioBytes() {
        long total = 0;
        File[] fs = audioDir.listFiles();
        if (fs != null) {
            for (File f : fs) {
                total += f.length();
            }
        }
        return total;
    }

    void clearAudio() {
        prepGen++;
        File[] fs = audioDir.listFiles();
        if (fs != null) {
            for (File f : fs) {
                f.delete();
            }
        }
    }

    private File audioFile(int speaker, String text) {
        String name;
        try {
            byte[] d = MessageDigest.getInstance("SHA-1").digest((speaker + "|" + text).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) {
                sb.append(String.format("%02x", b));
            }
            name = sb.toString();
        } catch (Exception e) {
            name = "h" + (speaker + "|" + text).hashCode();
        }
        return new File(audioDir, name + ".pcm");
    }

    /** বাক্যের শব্দ: জমানো থাকলে সেখান থেকে, নইলে মডেল চালিয়ে বানিয়ে জমিয়ে রাখা। */
    private short[] pcmFor(String text, int speaker) throws Exception {
        File f = audioFile(speaker, text);
        if (f.exists()) {
            return readPcm(f);
        }
        short[] pcm = synth(text, speaker, 1f);
        try {
            if (!audioDir.exists()) {
                audioDir.mkdirs();
            }
            File part = new File(audioDir, f.getName() + ".part");
            ByteBuffer bb = ByteBuffer.allocate(pcm.length * 2).order(ByteOrder.LITTLE_ENDIAN);
            bb.asShortBuffer().put(pcm);
            try (FileOutputStream out = new FileOutputStream(part)) {
                out.write(bb.array());
            }
            part.renameTo(f);
        } catch (Exception ignored) {
            /* জমাতে না পারলেও বাজানো চলবে */
        }
        return pcm;
    }

    private short[] readPcm(File f) throws Exception {
        byte[] data = new byte[(int) f.length()];
        try (FileInputStream in = new FileInputStream(f)) {
            int off = 0;
            while (off < data.length) {
                int n = in.read(data, off, data.length - off);
                if (n <= 0) {
                    break;
                }
                off += n;
            }
        }
        short[] pcm = new short[data.length / 2];
        ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(pcm);
        return pcm;
    }

    void stop() {
        gen++;
        AudioTrack t = track;
        if (t != null) {
            try {
                t.pause();
                t.flush();
            } catch (Exception ignored) {
                /* ট্র্যাক চালু না থাকলে কিছু করার নেই */
            }
        }
    }

    void shutdown() {
        stop();
        synthExec.shutdownNow();
        playExec.shutdownNow();
        AudioTrack t = track;
        if (t != null) {
            t.release();
        }
    }

    private void play(short[] pcm, int myGen, float rate) throws InterruptedException {
        AudioTrack t = track;
        if (t == null) {
            int min = AudioTrack.getMinBufferSize(SR, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
            t = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(SR)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .setBufferSizeInBytes(Math.max(min, 8192) * 2)
                    .build();
            track = t;
        }
        try {
            /* গতি বদলালেও গলার স্বর একই থাকে */
            t.setPlaybackParams(new PlaybackParams().setSpeed(rate).setPitch(1f));
        } catch (Exception ignored) {
            /* কিছু ফোনে গতি বদল চলে না; তখন স্বাভাবিক গতিতে বাজবে */
        }
        t.play();
        int start = t.getPlaybackHeadPosition();
        int off = 0;
        while (off < pcm.length && myGen == gen) {
            int n = t.write(pcm, off, Math.min(4096, pcm.length - off));
            if (n <= 0) {
                break;
            }
            off += n;
        }
        long deadline = System.currentTimeMillis() + (long) (pcm.length * 1000L / SR / Math.max(0.5f, rate)) + 1500;
        while (myGen == gen && t.getPlaybackHeadPosition() - start < off && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
    }

    /* ---------- মডেল ---------- */

    private synchronized void ensureLoaded() throws Exception {
        if (voc != null) {
            return;
        }
        File tf = new File(dir, "tokens.json");
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        try (FileInputStream in = new FileInputStream(tf)) {
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0) {
                bo.write(b, 0, n);
            }
        }
        JSONArray toks = new JSONObject(new String(bo.toByteArray(), StandardCharsets.UTF_8)).getJSONArray("tokens");
        table.clear();
        for (int i = 0; i < toks.length(); i++) {
            String s = toks.getString(i);
            if (s.length() == 1) {
                table.put(s.charAt(0), (long) i); /* একই অক্ষর দুবার থাকলে শেষেরটাই ধরা হয়, মূল মডেলের মতো */
            }
        }
        env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions so = new OrtSession.SessionOptions();
        so.setIntraOpNumThreads(Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors())));
        so.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        enc = env.createSession(new File(dir, "enc.int8.onnx").getAbsolutePath(), so);
        dec = env.createSession(new File(dir, "dec.int8.onnx").getAbsolutePath(), so);
        voc = env.createSession(new File(dir, "voc.onnx").getAbsolutePath(), so);
    }

    private synchronized void closeSessions() {
        try {
            if (enc != null) {
                enc.close();
            }
            if (dec != null) {
                dec.close();
            }
            if (voc != null) {
                voc.close();
            }
        } catch (Exception ignored) {
            /* বন্ধ করতে না পারলেও ফাইল মোছা চলবে */
        }
        enc = null;
        dec = null;
        voc = null;
    }

    /** মূল মডেলের multilingual_cleaners-এর সমান: চিহ্ন বদল, বাড়তি চিহ্ন বাদ, ফাঁক এক করা। */
    private long[] tokenize(String text) {
        String t = text.toLowerCase().replace(';', ',').replace('-', ' ').replace(':', ',');
        t = t.replaceAll("[<>()\\[\\]\"]+", "").replaceAll("\\s+", " ").trim();
        long[] tmp = new long[t.length()];
        int n = 0;
        for (int i = 0; i < t.length(); i++) {
            Long id = table.get(t.charAt(i));
            if (id != null) {
                tmp[n++] = id;
            }
        }
        long[] out = new long[n];
        System.arraycopy(tmp, 0, out, 0, n);
        return out;
    }

    private List<long[]> split(long[] ids) {
        List<long[]> parts = new ArrayList<>();
        Long space = table.get(' ');
        Long comma = table.get(',');
        int start = 0;
        while (ids.length - start > MAX_TOKENS) {
            int cut = -1;
            for (int i = start + MAX_TOKENS; i > start + MAX_TOKENS / 2; i--) {
                if (comma != null && ids[i] == comma) {
                    cut = i + 1;
                    break;
                }
            }
            if (cut < 0) {
                for (int i = start + MAX_TOKENS; i > start + MAX_TOKENS / 2; i--) {
                    if (space != null && ids[i] == space) {
                        cut = i + 1;
                        break;
                    }
                }
            }
            if (cut < 0) {
                cut = start + MAX_TOKENS;
            }
            parts.add(java.util.Arrays.copyOfRange(ids, start, cut));
            start = cut;
        }
        if (start < ids.length) {
            parts.add(java.util.Arrays.copyOfRange(ids, start, ids.length));
        }
        return parts;
    }

    private short[] synth(String text, int speaker, float rate) throws Exception {
        ensureLoaded();
        long[] ids = tokenize(text);
        int tail = SR * 15 / 100;
        if (ids.length == 0) {
            return new short[tail];
        }
        List<float[]> chunks = new ArrayList<>();
        int total = 0;
        for (long[] part : split(ids)) {
            float[] a = runOne(part, speaker, rate);
            chunks.add(a);
            total += a.length;
        }
        short[] pcm = new short[total + tail];
        int o = 0;
        for (float[] a : chunks) {
            for (float v : a) {
                float c = v > 1f ? 1f : (v < -1f ? -1f : v);
                pcm[o++] = (short) (c * 32767f);
            }
        }
        return pcm;
    }

    private float[] runOne(long[] ids, int speaker, float rate) throws Exception {
        int tLen = ids.length;
        float[] h;
        float[] logDur;
        int channels;
        try (OnnxTensor x = OnnxTensor.createTensor(env, LongBuffer.wrap(ids), new long[]{1, tLen});
             OnnxTensor s = OnnxTensor.createTensor(env, LongBuffer.wrap(new long[]{speaker}), new long[]{1})) {
            Map<String, OnnxTensor> in = new HashMap<>();
            in.put("x", x);
            in.put("sid", s);
            try (OrtSession.Result r = enc.run(in)) {
                OnnxTensor ht = (OnnxTensor) r.get(0);
                channels = (int) ht.getInfo().getShape()[1];
                FloatBuffer hb = ht.getFloatBuffer();
                h = new float[hb.remaining()];
                hb.get(h);
                FloatBuffer lb = ((OnnxTensor) r.get(1)).getFloatBuffer();
                logDur = new float[lb.remaining()];
                lb.get(logDur);
            }
        }
        /* প্রতি অক্ষরের স্থায়িত্ব; গতি বাড়ালে স্থায়িত্ব কমে */
        int[] dur = new int[tLen];
        int frames = 0;
        for (int t = 0; t < tLen; t++) {
            double v = (Math.exp(logDur[t]) - 1.0) / rate;
            int n = (int) Math.round(Math.max(v, 1.0));
            if (n > 150) {
                n = 150;
            }
            dur[t] = n;
            frames += n;
        }
        float[] ex = new float[channels * frames];
        for (int c = 0; c < channels; c++) {
            int o = c * frames;
            int base = c * tLen;
            for (int t = 0; t < tLen; t++) {
                float v = h[base + t];
                for (int k = dur[t]; k > 0; k--) {
                    ex[o++] = v;
                }
            }
        }
        try (OnnxTensor e = OnnxTensor.createTensor(env, FloatBuffer.wrap(ex), new long[]{1, channels, frames});
             OrtSession.Result r2 = dec.run(Collections.singletonMap("h", e))) {
            OnnxTensor mel = (OnnxTensor) r2.get(0);
            try (OrtSession.Result r3 = voc.run(Collections.singletonMap("mel", mel))) {
                FloatBuffer ab = ((OnnxTensor) r3.get(0)).getFloatBuffer();
                float[] a = new float[ab.remaining()];
                ab.get(a);
                return a;
            }
        }
    }
}
