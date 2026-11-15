#!/usr/bin/env bash
# OC Serif 子集化（可重跑）
#
# 用法：
#   bash scripts/fonts/subset.sh <可变字重思源宋体 OTF> [输出目录]
#
#   <可变字重思源宋体 OTF>  = NotoSerifSC-VF.otf
#     来自 https://github.com/notofonts/noto-cjk/releases 的
#     02_NotoSerifCJK-OTF-VF.zip → Variable/OTF/Subset/NotoSerifSC-VF.otf
#     （wght 轴 200–900，一个文件覆盖全部字重）
#   [输出目录]              默认 public/fonts
#
# 依赖：python3 + fonttools + brotli
#   python -m pip install fonttools brotli
#   Windows 上没有 python3 这个别名时：PYTHON=python bash scripts/fonts/subset.sh ...
#
# 字表：scripts/fonts/charset.txt（GB2312 一级汉字 3755 + 符号区 + ASCII + CJK 标点；
#       由 scripts/fonts/make-charset.py 生成，已提交，平时不用重新生成）。
#       覆盖范围偏「常用字」一侧，多出来的字只会让覆盖更全，不会缺字。
#
# 产物：oc-serif.woff2（单文件可变字重，约 1.35 MB）
#       globals.css 里一条 `@font-face 'OC Serif'`，`font-weight: 200 900`。
#       体积超过 2.5 MB 视为失败 —— 不要靠砍字表解决，先报告实际大小。
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "用法: bash scripts/fonts/subset.sh <NotoSerifSC-VF.otf> [输出目录]" >&2
  exit 2
fi

SRC="$1"
OUT="${2:-public/fonts}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHARSET="$HERE/charset.txt"
LIMIT_BYTES=$((2500 * 1024))

PY="${PYTHON:-python3}"
command -v "$PY" >/dev/null 2>&1 || PY=python

if [ ! -f "$SRC" ]; then
  echo "找不到源字体: $SRC" >&2
  exit 2
fi
if [ ! -f "$CHARSET" ]; then
  echo "找不到字表: $CHARSET" >&2
  exit 2
fi
mkdir -p "$OUT"

# 与 charset.txt 里的区段一致：ASCII + CJK 标点 + 全角区
UNICODES="U+0020-007E,U+3000-303F,U+FF00-FFEF"

echo "字表: $CHARSET ($(wc -m < "$CHARSET") 字符)"
echo "输出: $OUT"

"$PY" -m fontTools.subset "$SRC" \
  --text-file="$CHARSET" \
  --unicodes="$UNICODES" \
  --flavor=woff2 \
  --output-file="$OUT/oc-serif.woff2"

SIZE=$(wc -c < "$OUT/oc-serif.woff2")
echo "  oc-serif.woff2  $((SIZE / 1024)) KB"
echo "总体积: $((SIZE / 1024)) KB / 上限 2500 KB"
if [ "$SIZE" -gt "$LIMIT_BYTES" ]; then
  echo "超预算：实际 $((SIZE / 1024)) KB。不要自己砍字表，先报告大小。" >&2
  exit 1
fi
