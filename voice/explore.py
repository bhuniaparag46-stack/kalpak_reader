"""AI4Bharat Indic-TTS বাংলা মডেল খুলে দেখা ও নমুনা বানানো।"""
import json, os, sys, glob, traceback
root = sys.argv[1]
for dp, dn, fn in os.walk(root):
    for f in fn:
        p = os.path.join(dp, f)
        print(f"{os.path.getsize(p):>12}  {p}")
cfgs = glob.glob(os.path.join(root, "**", "config.json"), recursive=True)
for c in cfgs:
    j = json.load(open(c, encoding="utf-8"))
    print("=====", c)
    keep = {k: j.get(k) for k in ["model", "use_speaker_embedding", "num_speakers", "speakers_file", "use_phonemes", "phoneme_language", "text_cleaner", "add_blank", "enable_eos_bos_chars", "characters", "use_d_vector_file", "d_vector_file"]}
    print(json.dumps(keep, ensure_ascii=False, indent=1)[:6000])
    print("audio:", json.dumps(j.get("audio"), ensure_ascii=False)[:1500])
    ma = j.get("model_args") or {}
    print("model_args:", json.dumps(ma, ensure_ascii=False)[:3000])
try:
    import torch
    for sp in glob.glob(os.path.join(root, "**", "speakers.pth"), recursive=True):
        print("speakers:", sp, torch.load(sp))
except Exception:
    traceback.print_exc()
