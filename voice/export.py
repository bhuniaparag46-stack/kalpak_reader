"""AI4Bharat Indic-TTS বাংলা মডেলকে ফোনে চলার উপযোগী ONNX রূপে আনা ও যাচাই।

তিনটি গ্রাফ তৈরি হয়:
  enc.onnx : অক্ষরের ক্রম + বক্তা  ->  এনকোডারের ফল, প্রতি অক্ষরের স্থায়িত্ব (log)
  dec.onnx : স্থায়িত্ব অনুযায়ী ছড়ানো ফল  ->  মেল-বর্ণালি
  voc.onnx : মেল-বর্ণালি  ->  শব্দতরঙ্গ (22050 Hz)
স্থায়িত্ব অনুযায়ী ছড়ানোর কাজটা অ্যাপ নিজে করে, তাই গ্রাফে জটিল গতিশীল ধাপ লাগে না।
"""
import inspect
import json
import os
import sys
import time
import traceback
import wave

import numpy as np
import torch

root, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
FP = os.path.join(root, "bn", "fastpitch")
HG = os.path.join(root, "bn", "hifigan")

from TTS.utils.synthesizer import Synthesizer

# config.json-এ বক্তা-তালিকার যে পথ লেখা আছে, সেখানেই ফাইলটা রেখে দেওয়া
import shutil
os.makedirs("models/v1/bn/fastpitch", exist_ok=True)
shutil.copy(os.path.join(FP, "speakers.pth"), "models/v1/bn/fastpitch/speakers.pth")

synth = Synthesizer(
    tts_checkpoint=os.path.join(FP, "best_model.pth"),
    tts_config_path=os.path.join(FP, "config.json"),
    tts_speakers_file=os.path.join(FP, "speakers.pth"),
    vocoder_checkpoint=os.path.join(HG, "best_model.pth"),
    vocoder_config=os.path.join(HG, "config.json"),
    use_cuda=False,
)
m = synth.tts_model.eval()
voc = synth.vocoder_model.eval()
tok = m.tokenizer
SR = 22050

for name in ["inference", "_forward_encoder", "_forward_decoder", "_forward_pitch_predictor", "format_durations", "expand_encoder_outputs", "_set_speaker_input"]:
    try:
        print("#### SOURCE", name)
        print(inspect.getsource(getattr(type(m), name)))
    except Exception as e:
        print("no source", name, e)
try:
    print("#### SOURCE vocoder.inference")
    print(inspect.getsource(type(voc).inference))
    print("#### SOURCE tokenizer.text_to_ids")
    print(inspect.getsource(type(tok).text_to_ids))
    from TTS.tts.utils.text import cleaners
    print(inspect.getsource(cleaners.multilingual_cleaners))
    print(inspect.getsource(cleaners.replace_symbols))
    print(inspect.getsource(cleaners.remove_aux_symbols))
except Exception:
    traceback.print_exc()


def save_wav(path, audio):
    a = np.clip(np.asarray(audio, dtype=np.float32), -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((a * 32767).astype(np.int16).tobytes())


TEXTS = [
    "মগজের ভেতর থেকে শব্দগুলো ভেসে আসতে সে ট্র্যাক বরাবর দৌড়াতে শুরু করল।",
    "‘নয়তো কী? আমায় নড়তে দিলে না যে।’",
    "ক্ষমা, জ্ঞান, রাষ্ট্র, ঊর্ধ্ব আর কাঁচ — এই শব্দগুলো ঠিকমতো উচ্চারণ হচ্ছে তো?",
]

# ---------- ১. মূল মডেলের নমুনা ----------
for sp in ["female", "male"]:
    t0 = time.time()
    wav = synth.tts(TEXTS[0], speaker_name=sp)
    dt = time.time() - t0
    print(f"torch {sp}: {len(wav)/SR:.2f}s audio in {dt:.2f}s")
    save_wav(os.path.join(out, f"ref-{sp}.wav"), wav)

# ---------- ২. অক্ষর-তালিকা ও পরীক্ষার নমুনা ----------
vocab = list(tok.characters.vocab)
print("vocab", len(vocab), vocab)
tests = []
for t in TEXTS + ["ক খ: গ; ঘ-ঙ (চ) ৭ ৯ A b", "  দুই   ফাঁক  "]:
    tests.append({"text": t, "ids": [int(i) for i in tok.text_to_ids(t)]})
json.dump({"tokens": vocab, "sample_rate": SR, "hop": 256, "speakers": {"female": 1, "male": 2}, "tests": tests},
          open(os.path.join(out, "tokens.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(tests, ensure_ascii=False))


# ---------- ৩. মোড়ক ----------
class Enc(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, x, sid):
        m = self.m
        x_mask = torch.ones_like(x).unsqueeze(1).to(torch.float32)
        o_en, x_mask, g, _ = m._forward_encoder(x, x_mask, sid)
        o_dr_log = m.duration_predictor(o_en, x_mask)
        o_pitch_emb, _ = m._forward_pitch_predictor(o_en, x_mask)
        return o_en + o_pitch_emb, o_dr_log.reshape(1, -1)


class Dec(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, h):
        m = self.m
        y_mask = torch.ones_like(h[:, :1, :])
        if hasattr(m, "pos_encoder"):
            h = m.pos_encoder(h, y_mask)
        return m.decoder(h, y_mask, g=None)


class Voc(torch.nn.Module):
    def __init__(self, v):
        super().__init__()
        self.v = v

    def forward(self, mel):
        return self.v.inference(mel)


class SimpleAttn(torch.nn.Module):
    """এক-মাথা self-attention; ইনপুট [T, 1, C]"""

    def __init__(self, mha):
        super().__init__()
        c = mha.embed_dim
        self.scale = float(c) ** -0.5
        w, bias = mha.in_proj_weight.detach(), mha.in_proj_bias.detach()
        self.wq, self.wk, self.wv = (torch.nn.Parameter(w[i * c:(i + 1) * c].clone(), requires_grad=False) for i in range(3))
        self.bq, self.bk, self.bv = (torch.nn.Parameter(bias[i * c:(i + 1) * c].clone(), requires_grad=False) for i in range(3))
        self.out = mha.out_proj

    def forward(self, query, key=None, value=None, attn_mask=None, key_padding_mask=None, need_weights=True):
        x = query.transpose(0, 1)  # [1, T, C]
        q = torch.nn.functional.linear(x, self.wq, self.bq) * self.scale
        k = torch.nn.functional.linear(x, self.wk, self.bk)
        v = torch.nn.functional.linear(x, self.wv, self.bv)
        att = torch.softmax(torch.matmul(q, k.transpose(1, 2)), dim=-1)
        o = self.out(torch.matmul(att, v))
        return o.transpose(0, 1), att


enc, dec, vocw = Enc(m).eval(), Dec(m).eval(), Voc(voc).eval()


def durations(log_dur, scale=1.0):
    d = (np.exp(log_dur) - 1.0) * scale
    d = np.round(np.maximum(d, 1.0)).astype(np.int64)
    return d.reshape(-1)


def expand(h, d):
    # h: [1,C,T], d: [T]  ->  [1,C,sum(d)]
    return np.repeat(h, d, axis=2)


def ids_of(text):
    return torch.tensor([tok.text_to_ids(text)], dtype=torch.long)


# ---------- ৪. মোড়ক আর মূল মডেলের ফল মেলে কি না ----------
with torch.no_grad():
    x = ids_of(TEXTS[0])
    sid = torch.tensor([1], dtype=torch.long)
    ref = m.inference(x, aux_input={"d_vectors": None, "speaker_ids": sid})
    ref_mel = ref["model_outputs"].numpy()  # [1,F,80]
    # nn.MultiheadAttention রপ্তানিতে বাক্যের দৈর্ঘ্য বেঁধে ফেলে, তাই একই ওজন দিয়ে নিজস্ব সরল রূপ বসানো
    n_patched = 0
    for mod in list(m.modules()):
        for cname, child in list(mod.named_children()):
            if isinstance(child, torch.nn.MultiheadAttention):
                assert child.num_heads == 1 and child._qkv_same_embed_dim
                setattr(mod, cname, SimpleAttn(child))
                n_patched += 1
    print("patched attention layers:", n_patched)
    h, ld = enc(x, sid)
    d = durations(ld.numpy())
    mel = dec(torch.tensor(expand(h.numpy(), d))).numpy()  # [1,80,F]
    print("ref mel", ref_mel.shape, "wrapped mel", mel.shape)
    diff = float(np.abs(ref_mel.transpose(0, 2, 1) - mel).max()) if ref_mel.shape[1] == mel.shape[2] else -1
    print("WRAP_MAXDIFF", diff)
    try:
        voc.remove_weight_norm()
    except Exception as e:
        print("remove_weight_norm:", e)
    wav = vocw(torch.tensor(mel)).numpy().reshape(-1)
    print("wrapped wav seconds", len(wav) / SR)
    save_wav(os.path.join(out, "wrapped-female.wav"), wav)

# ---------- ৫. ONNX রপ্তানি ----------
with torch.no_grad():
    torch.onnx.export(enc, (x, sid), os.path.join(out, "enc.onnx"), input_names=["x", "sid"], output_names=["h", "logdur"],
                      dynamic_axes={"x": {1: "T"}, "h": {2: "T"}, "logdur": {1: "T"}}, opset_version=17)
    hx = torch.tensor(expand(h.numpy(), d))
    torch.onnx.export(dec, (hx,), os.path.join(out, "dec.onnx"), input_names=["h"], output_names=["mel"],
                      dynamic_axes={"h": {2: "F"}, "mel": {2: "F"}}, opset_version=17)
    torch.onnx.export(vocw, (torch.tensor(mel),), os.path.join(out, "voc.onnx"), input_names=["mel"], output_names=["audio"],
                      dynamic_axes={"mel": {2: "F"}, "audio": {2: "S"}}, opset_version=17)

# ---------- ৬. ছোট করা (int8) ----------
from onnxruntime.quantization import QuantType, quantize_dynamic

for n in ["enc", "dec"]:
    try:
        quantize_dynamic(os.path.join(out, n + ".onnx"), os.path.join(out, n + ".int8.onnx"), weight_type=QuantType.QUInt8)
    except Exception:
        traceback.print_exc()

for f in sorted(os.listdir(out)):
    print(f"SIZE {os.path.getsize(os.path.join(out, f)):>12} {f}")

# ---------- ৭. ONNX দিয়ে পুরো পথ যাচাই ----------
import onnxruntime as ort


def run_all(tag, enc_f, dec_f):
    so = ort.SessionOptions()
    so.intra_op_num_threads = 2
    se = ort.InferenceSession(os.path.join(out, enc_f), so, providers=["CPUExecutionProvider"])
    sd = ort.InferenceSession(os.path.join(out, dec_f), so, providers=["CPUExecutionProvider"])
    sv = ort.InferenceSession(os.path.join(out, "voc.onnx"), so, providers=["CPUExecutionProvider"])
    for ti, text in enumerate(TEXTS):
        for sp, spid in [("female", 1), ("male", 2)]:
            xi = np.array([tok.text_to_ids(text)], dtype=np.int64)
            t0 = time.time()
            hh, ldd = se.run(None, {"x": xi, "sid": np.array([spid], dtype=np.int64)})
            dd = durations(ldd)
            t1 = time.time()
            mm = sd.run(None, {"h": expand(hh, dd).astype(np.float32)})[0]
            t2 = time.time()
            aa = sv.run(None, {"mel": mm})[0].reshape(-1)
            t3 = time.time()
            secs = len(aa) / SR
            with torch.no_grad():
                th, tld = enc(torch.tensor(xi), torch.tensor([spid]))
                td = durations(tld.numpy())
                tm = dec(torch.tensor(expand(th.numpy(), td))).numpy()
            same = tm.shape == mm.shape
            md = float(np.abs(tm - mm).max()) if same else -1
            print(f"ONNX[{tag}] text{ti} {sp}: T={xi.shape[1]} F={mm.shape[2]} audio={secs:.2f}s enc={t1-t0:.2f}s dec={t2-t1:.2f}s voc={t3-t2:.2f}s RTF={(t3-t0)/secs:.2f} mel_maxdiff={md:.4f} same_len={same}")
            if ti < 2:
                save_wav(os.path.join(out, f"onnx-{tag}-{sp}-{ti}.wav"), aa)


for tag, e, dd_ in [("fp32", "enc.onnx", "dec.onnx"), ("int8", "enc.int8.onnx", "dec.int8.onnx")]:
    try:
        run_all(tag, e, dd_)
    except Exception:
        print("FAILED", tag)
        traceback.print_exc()
print("EXPORT_DONE")
