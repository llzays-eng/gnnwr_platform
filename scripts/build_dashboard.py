"""
构建独立可视化看板
==================
把 `python -m engine.run_demo` 产出的真实数据（demo/dashboard_data.json），
内联进看板模板（demo/_template.html）的占位符，生成一个「零依赖、双击即可打开、离线可看」的单文件看板。

用法：
    python -m scripts.build_dashboard \
        --data demo/dashboard_data.json \
        --template demo/_template.html \
        --out /mnt/user-data/outputs/GNNWR分析看板.html
"""
from __future__ import annotations

import argparse
import json
import os


PLACEHOLDER = "/*__DATA__*/"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="demo/dashboard_data.json")
    ap.add_argument("--template", default="demo/_template.html")
    ap.add_argument("--out", default="/tmp/GNNWR分析看板.html")
    args = ap.parse_args()

    with open(args.data, encoding="utf-8") as f:
        data_text = f.read()
    # 防御：数据里若含 </script> 会破坏内联脚本块
    data_text = data_text.replace("</", "<\\/")

    with open(args.template, encoding="utf-8") as f:
        html = f.read()
    if PLACEHOLDER not in html:
        raise SystemExit(f"模板中未找到占位符 {PLACEHOLDER}")
    # 新模板形如 `const DATA = /*__DATA__*/{};`（带空对象兜底），
    # 必须连同兜底 `{}` 一起替换，否则会拼出 `...}{}` 语法错误。
    if PLACEHOLDER + "{}" in html:
        html = html.replace(PLACEHOLDER + "{}", data_text, 1)
    else:
        html = html.replace(PLACEHOLDER, data_text, 1)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"[dashboard] 已生成 {args.out}（{os.path.getsize(args.out)/1024:.0f} KB）")


if __name__ == "__main__":
    main()
